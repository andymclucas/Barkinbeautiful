/**
 * Cancel the dogs MoeGo has cancelled and Groomigo still shows as live.
 *
 * Andy, 01/11/2026, after the Monday sync report: "Cancel those two dogs
 * on Tuesday's board."
 *
 *   corepack pnpm exec tsx scripts/moego-cancel-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-cancel-2026-11-01.ts --apply
 *
 * ## It cancels ONE of the two. Louis is coming.
 *
 * The report flagged Varinia Taylor's Louis because the booking his
 * Groomigo row points at (124647286) is cancelled in MoeGo. It is — but
 * the SAME client has a second 08:30 booking that day (95442576) which
 * MoeGo lists as "Torah, Louis", and MoeGo's own calendar shows
 * "Varinia Taylor · Louis (Schnauzer) · 08:30-09:30 · Megan ·
 * Confirmed". His bath was cancelled and he was rebooked onto the other
 * booking as a styled groom.
 *
 * Cancelling on "this booking id is cancelled" would therefore have
 * taken a dog who IS coming off Tuesday's board. Left alone, and
 * reported instead: his row needs its service and booking id corrected,
 * which changes a price and is not a cancellation.
 *
 * ## Guards
 *
 * One transaction. Every write is matched on appointment id AND tenant
 * AND pet AND client AND `workflow_state = 'scheduled'`, and the whole
 * thing rolls back unless exactly one row is affected. A dog past
 * `scheduled` is at the salon and is untouchable.
 *
 * Both columns are set, not one: `workflow_state` drives the board and
 * `status` drives everything else, and half of it is worse than neither.
 * A `workflow_logs` row records the transition, because that trail is
 * what the Pet Tracker and the timing analytics read.
 *
 * Nothing is sent. A direct SQL write runs no application code, so it
 * enqueues no reminder; SMS_AUTOMATION_ENABLED is false here as well.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

/** Verified individually against MoeGo's calendar on 01/11/2026. */
const CANCEL = [
  {
    appointmentId: 2550076,
    petName: "Boo",
    clientName: "Melissa Rose",
    day: "2026-11-03",
    moegoBookingId: "136988440",
    why: "Cancelled in MoeGo 30/10 ('reply N to cancel'); client has no other booking in the three-week window and appears nowhere on MoeGo's calendar that week.",
  },
];

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  for (const t of CANCEL) {
    const [rows]: any = await c.query(
      `SELECT a.id, a.workflow_state, a.status, a.moego_appointment_id mid,
              p.name pet, CONCAT(cl.first_name,' ',cl.last_name) client,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d %H:%i') slot
         FROM appointments a
         LEFT JOIN pets p ON p.id=a.pet_id
         LEFT JOIN clients cl ON cl.id=a.client_id
        WHERE a.id=? AND a.tenant_id=?`, [t.appointmentId, TENANT]);
    const r = rows[0];
    console.log(`\n${t.petName} (${t.clientName}) — appointment ${t.appointmentId}`);
    if (!r) { console.log("  NOT FOUND — aborting"); process.exit(1); }
    console.log(`  on file : ${r.pet} / ${r.client} / ${r.slot} / ${r.workflow_state} / ${r.status} / booking ${r.mid}`);
    console.log(`  why     : ${t.why}`);

    // Every expectation checked before anything is written.
    const problems = [
      r.pet !== t.petName && `pet is ${r.pet}, expected ${t.petName}`,
      r.client !== t.clientName && `client is ${r.client}, expected ${t.clientName}`,
      !r.slot.startsWith(t.day) && `slot is ${r.slot}, expected ${t.day}`,
      String(r.mid) !== t.moegoBookingId && `booking id is ${r.mid}, expected ${t.moegoBookingId}`,
      r.workflow_state !== "scheduled" && `workflow_state is ${r.workflow_state}, not scheduled`,
    ].filter(Boolean);
    if (problems.length) { console.log("  MISMATCH:", problems.join("; "), "— aborting"); process.exit(1); }
    console.log("  checks  : pet, client, date, booking id and state all match");
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — ${CANCEL.length} to cancel, nothing written. Re-run with --apply.`);
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    for (const t of CANCEL) {
      const [res]: any = await c.query(
        `UPDATE appointments a
            JOIN pets p ON p.id=a.pet_id
            JOIN clients cl ON cl.id=a.client_id
            SET a.workflow_state='cancelled', a.status='cancelled'
          WHERE a.id=? AND a.tenant_id=? AND a.workflow_state='scheduled'
            AND p.name=? AND CONCAT(cl.first_name,' ',cl.last_name)=?`,
        [t.appointmentId, TENANT, t.petName, t.clientName]);
      if (res.affectedRows !== 1) throw new Error(`${t.petName}: affected ${res.affectedRows} rows, expected 1`);

      await c.query(
        `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes)
         VALUES (?, 'scheduled', 'cancelled', ?)`,
        [t.appointmentId,
         `Cancelled by the MoeGo sync on 01/11/2026. MoeGo booking ${t.moegoBookingId} was cancelled on 30/10/2026.`]);
      console.log(`cancelled ${t.petName} (${t.clientName}) and wrote the audit row`);
    }
    await c.commit();
    console.log("\ncommitted");
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  const [after]: any = await c.query(
    `SELECT a.id, p.name pet, a.workflow_state, a.status,
            (SELECT COUNT(*) FROM workflow_logs w WHERE w.appointment_id=a.id AND w.to_state='cancelled') logs
       FROM appointments a LEFT JOIN pets p ON p.id=a.pet_id
      WHERE a.id IN (${CANCEL.map(() => "?").join(",")})`, CANCEL.map((t) => t.appointmentId));
  console.table(after);
  await c.end();
})();

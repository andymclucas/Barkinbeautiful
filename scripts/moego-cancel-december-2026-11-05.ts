/**
 * Cancel the December dogs MoeGo has cancelled and the board still shows.
 *
 * Andy, 05/11/2026: "Do the cancellations and creates, then retail."
 *
 *   corepack pnpm exec tsx scripts/moego-cancel-december-2026-11-05.ts
 *   corepack pnpm exec tsx scripts/moego-cancel-december-2026-11-05.ts --apply
 *
 * MoeGo's cancelled report for December (pulled 05/11/2026) holds 62
 * bookings. Four of them were still live on the Groomigo board. Three
 * are cancelled here.
 *
 * ## The fourth is deliberately NOT here: Luke (Phillipa Perlin)
 *
 * Booking 131770490 is cancelled in MoeGo, and Luke's 18/12 07:30 row
 * points at it — so the naive read is that he is not coming. He is.
 * MoeGo rebooked him onto 136092815 the same morning, same time, as
 * "Masie, Luke, Leia".
 *
 * That replacement booking lists three groomers for three dogs, which
 * Trap 3 says cannot be aligned by position, so the create run held it
 * for Lauren. Cancelling Luke now would take him off the board with
 * nothing to put him back. He stays until 136092815 is placed.
 *
 * This is the same shape as Louis on 01/11/2026, and the reason that
 * run's script says to check for a replacement booking before believing
 * a cancellation.
 *
 * Yuki is the opposite case and is safe: both her cancelled bookings
 * are here, and her replacement (136610991, 09/12) was created by the
 * same run, so she stays on the board.
 *
 * ## Guards
 *
 * One transaction. Every write is matched on appointment id AND tenant
 * AND pet AND client AND `workflow_state = 'scheduled'`, and the whole
 * thing rolls back unless exactly one row is affected. Both columns are
 * set. A `workflow_logs` row records each transition.
 *
 * Nothing is sent: a direct SQL write runs no application code.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

const CANCEL = [
  { appointmentId: 1200229, petName: "Yuki", clientName: "Sam Costa", day: "2026-12-01",
    moegoBookingId: "112819836",
    why: "Cancelled in MoeGo. Rebooked to 09/12 (136610991), which this run created, so she stays on the board." },
  { appointmentId: 1200230, petName: "Yuki", clientName: "Sam Costa", day: "2026-12-22",
    moegoBookingId: "112819837",
    why: "Cancelled in MoeGo. Same client, same rebooking to 09/12." },
  { appointmentId: 1200374, petName: "Ishkah", clientName: "Peter Brabant", day: "2026-12-18",
    moegoBookingId: "122892114",
    why: "Cancelled in MoeGo. No replacement booking anywhere in the December pull." },
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
    console.log(`  on file : ${r.pet} / ${r.client} / ${r.slot} / ${r.workflow_state} / booking ${r.mid}`);
    console.log(`  why     : ${t.why}`);

    const problems = [
      r.pet !== t.petName && `pet is ${r.pet}`,
      r.client !== t.clientName && `client is ${r.client}`,
      !r.slot.startsWith(t.day) && `slot is ${r.slot}`,
      String(r.mid) !== t.moegoBookingId && `booking id is ${r.mid}`,
      r.workflow_state !== "scheduled" && `state is ${r.workflow_state}`,
    ].filter(Boolean);
    if (problems.length) { console.log("  MISMATCH:", problems.join("; "), "— aborting"); process.exit(1); }

    // The Louis check, made explicit: a cancelled booking id does not
    // mean the dog is not coming.
    const [other]: any = await c.query(
      `SELECT a.id, a.moego_appointment_id mid, a.workflow_state st
         FROM appointments a
        WHERE a.pet_id=(SELECT pet_id FROM appointments WHERE id=?)
          AND a.id<>? AND DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'))=?`,
      [t.appointmentId, t.appointmentId, t.day]);
    if (other.length) {
      console.log(`  REPLACEMENT FOUND that day (${other.map((o: any) => `${o.mid} ${o.st}`).join("; ")}) — aborting, this needs a human`);
      process.exit(1);
    }
    console.log("  checks  : pet, client, date, booking id, state, and no replacement that day");
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
         `Cancelled by the MoeGo December reconciliation on 05/11/2026. MoeGo booking ${t.moegoBookingId} is cancelled.`]);
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

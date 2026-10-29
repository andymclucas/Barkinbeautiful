/**
 * Apply the reviewed MoeGo → Groomigo plan. Andy approved it 29/10/2026.
 *
 *   tsx scripts/moego-missing-dogs-apply.ts            # prints, writes nothing
 *   tsx scripts/moego-missing-dogs-apply.ts --apply    # one transaction
 *
 * Writes only the dogs whose price is certain, plus the two cancellations
 * MoeGo has that Groomigo's board does not. Everything runs in one
 * transaction and rolls back whole on any surprise.
 *
 * Nothing here enqueues a client message: a direct SQL write runs no
 * application code, and none of the reminder columns are touched.
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const APPLY = process.argv.includes("--apply");
const TENANT = 1;

/** Brisbane is UTC+10 with no DST. Build the UTC string explicitly rather
 *  than letting a Date pick up the machine's timezone (e6a4662). */
function toUtc(dateISO: string, time12: string): string {
  const m = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`unparseable time: ${time12}`);
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  const local = new Date(`${dateISO}T${String(h).padStart(2, "0")}:${m[2]}:00Z`);
  local.setUTCHours(local.getUTCHours() - 10);
  return local.toISOString().slice(0, 19).replace("T", " ");
}
const plus = (utc: string, mins: number) => {
  const d = new Date(utc.replace(" ", "T") + "Z");
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

const { plan } = JSON.parse(fs.readFileSync(S + "/plan.json", "utf8"));
const creates = plan.filter((p: any) => p.price !== null);

/** Confirmed cancelled in MoeGo and still live here, re-checked against a
 *  fresh pull immediately before this ran (Trap 6). */
const CANCELS = [
  { apptId: 1200228, booking: "112819835", dog: "Yuki", who: "Sam Costa" },
  { apptId: 1230015, booking: "133150748", dog: "Winston", who: "Diana Logue" },
];

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY (pass --apply to write) ===");
  console.log(`creates: ${creates.length}   cancels: ${CANCELS.length}\n`);

  await c.beginTransaction();
  let created = 0, cancelled = 0;
  try {
    for (const p of creates) {
      /* Trap 5. Look for ANY appointment for this dog that day, whatever
         its booking id or state — a row created in Groomigo carries a
         NULL moego id, and a cancelled row is still a row. Duplicating a
         dog onto a live board is the worst outcome of this sync. */
      const [clash] = await c.query<any[]>(
        `SELECT id, workflow_state FROM appointments
          WHERE pet_id = ? AND DATE(CONVERT_TZ(scheduled_start,"+00:00","+10:00")) = ?`,
        [p.petId, p.date]);
      if (clash.length) throw new Error(`${p.dog} on ${p.date} already has appointment ${clash[0].id} (${clash[0].workflow_state}) — aborting, nothing written`);

      const start = toUtc(p.date, p.time);
      const end = plus(start, p.minutes);
      const notes = `Created from MoeGo booking ${p.booking} on 29/10/2026 — this dog was on the MoeGo booking but missing from the Groomigo board.`;
      if (APPLY) {
        const [res] = await c.query<any>(
          `INSERT INTO appointments
             (tenant_id, client_id, pet_id, staff_id, scheduled_start, scheduled_end,
              service_type, price, status, workflow_state, moego_appointment_id, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [TENANT, p.clientId, p.petId, p.staffId, start, end, p.serviceType, p.price,
           p.status === "Confirmed" ? "confirmed" : "pending", "scheduled", p.booking, notes]);
        if (res.affectedRows !== 1) throw new Error(`insert for ${p.dog} affected ${res.affectedRows} rows`);
      }
      created++;
      console.log(`  + ${p.date} ${p.time.padEnd(9)} ${p.dog.padEnd(10)} ${String(p.minutes).padStart(3)}m $${String(p.price).padStart(7)} staff ${p.staffId}  (${start} UTC)`);
    }

    for (const x of CANCELS) {
      /* Trap 4: only ever act on a row still at `scheduled`, set BOTH
         columns, and write the audit row the Pet Tracker and the timing
         analytics are built on. */
      if (APPLY) {
        const [res] = await c.query<any>(
          `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
            WHERE id = ? AND workflow_state = 'scheduled'`, [x.apptId]);
        if (res.affectedRows !== 1) throw new Error(`cancel of ${x.dog} (appt ${x.apptId}) affected ${res.affectedRows} rows, expected 1 — aborting`);
        await c.query(
          `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes)
           VALUES (?,?,?,?)`,
          [x.apptId, "scheduled", "cancelled",
           `Cancelled in MoeGo (booking ${x.booking}); applied by the 29/10/2026 MoeGo sync.`]);
      }
      cancelled++;
      console.log(`  x ${x.dog} (${x.who}) appt ${x.apptId} -> cancelled`);
    }

    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${created} created, ${cancelled} cancelled`); }
    else { await c.rollback(); console.log(`\nrolled back (dry run): would create ${created}, cancel ${cancelled}`); }
  } catch (e: any) {
    await c.rollback();
    console.log(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

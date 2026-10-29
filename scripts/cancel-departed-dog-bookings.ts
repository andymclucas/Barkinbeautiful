/**
 * Cancel future bookings for dogs recorded as passed away.
 *
 * The code change stops NEW bookings. This clears the ones already on
 * the board from before the guard existed. Andy approved 29/10/2026.
 *
 * Only ever touches a row still at `scheduled` whose pet is genuinely
 * `departed`, and writes the audit row the Pet Tracker and the timing
 * analytics are built on.
 *
 *   tsx scripts/cancel-departed-dog-bookings.ts            # prints
 *   tsx scripts/cancel-departed-dog-bookings.ts --apply    # writes
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  await c.beginTransaction();
  let n = 0;
  try {
    const [rows] = await c.query<any[]>(
      `SELECT a.id, p.name dog, p.status petStatus, a.price, cl.first_name, cl.last_name,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"),'%d/%m/%Y %H:%i') t,
              DATE_FORMAT(p.departed_at,'%d/%m/%Y') departed
         FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients cl ON cl.id=a.client_id
        WHERE p.status='departed'
          AND a.scheduled_start >= NOW()
          AND a.workflow_state = 'scheduled'
        ORDER BY a.scheduled_start`);
    console.log(APPLY ? "=== APPLYING ===" : "=== DRY ===");
    console.log(`future bookings for departed dogs: ${rows.length}\n`);
    for (const r of rows) {
      if (r.petStatus !== "departed") throw new Error(`${r.dog} is ${r.petStatus} — refusing`);
      if (APPLY) {
        const [res] = await c.query<any>(
          `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
            WHERE id=? AND workflow_state='scheduled'`, [r.id]);
        if (res.affectedRows !== 1) throw new Error(`${r.dog} (appt ${r.id}) affected ${res.affectedRows} rows — aborting`);
        await c.query(
          `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes) VALUES (?,?,?,?)`,
          [r.id, "scheduled", "cancelled",
           `${r.dog} was recorded as passed away on ${r.departed}. Booking cleared by the 29/10/2026 departed-dog sweep.`]);
      }
      n++;
      console.log(`  x ${r.t}  ${String(r.dog).padEnd(10)} ${r.first_name} ${r.last_name}  $${r.price ?? "(none)"}  (departed ${r.departed})`);
    }
    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${n} cancelled`); }
    else { await c.rollback(); console.log(`\nrolled back (dry): would cancel ${n}`); }
  } catch (e: any) {
    await c.rollback(); console.log(`\nROLLED BACK — nothing written. ${e.message}`); process.exitCode = 1;
  }
  await c.end();
})();

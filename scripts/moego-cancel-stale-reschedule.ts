/**
 * Cancel a Groomigo row left behind by a MoeGo reschedule.
 *
 * MoeGo booking 117725786 (Denise Partis, Maddie + Misha) moved from
 * 19/11 to 11/11. Groomigo kept the 19/11 row, carrying the same booking
 * id and the whole $250 total. Once both dogs were created on 11/11 on
 * 29/10/2026, Maddie was on the board twice.
 *
 * This is NOT a delete-on-absence (Trap 9): the booking id is present in
 * MoeGo, on a different date, and Denise Partis has nothing at all on
 * 19/11 — checked against the live report, 28 bookings that day, none
 * hers.
 *
 *   tsx scripts/moego-cancel-stale-reschedule.ts            # prints
 *   tsx scripts/moego-cancel-stale-reschedule.ts --apply    # writes
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const APPT = 1200271;                 // Maddie, 19/11 07:30
const BOOKING = "117725786";

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  await c.beginTransaction();
  try {
    const [[row]] = await c.query<any[]>(
      `SELECT a.id, p.name dog, a.price, a.workflow_state, a.moego_appointment_id bid,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"),'%d/%m %H:%i') t
         FROM appointments a JOIN pets p ON p.id=a.pet_id WHERE a.id=?`, [APPT]) as any;
    if (!row) throw new Error(`appointment ${APPT} not found`);
    if (row.bid !== BOOKING) throw new Error(`appointment ${APPT} carries booking ${row.bid}, expected ${BOOKING}`);
    if (row.workflow_state !== "scheduled") throw new Error(`appointment ${APPT} is ${row.workflow_state}, not scheduled — refusing`);

    /* The dogs must already be on the board at the new date, or
       cancelling this takes Maddie off the board entirely. */
    const [live] = await c.query<any[]>(
      `SELECT p.name, DATE_FORMAT(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"),'%d/%m %H:%i') t
         FROM appointments a JOIN pets p ON p.id=a.pet_id
        WHERE a.moego_appointment_id=? AND a.id<>? AND a.workflow_state="scheduled"`, [BOOKING, APPT]);
    if (live.length < 2) throw new Error(`only ${live.length} live rows on the new date — refusing to cancel the old one`);

    console.log(`cancelling: appt ${row.id}  ${row.t}  ${row.dog}  $${row.price}  (${row.workflow_state})`);
    console.log(`keeping:    ${live.map((r) => `${r.name} ${r.t}`).join(", ")}`);

    if (APPLY) {
      const [res] = await c.query<any>(
        `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
          WHERE id=? AND workflow_state='scheduled'`, [APPT]);
      if (res.affectedRows !== 1) throw new Error(`affected ${res.affectedRows} rows, expected 1`);
      await c.query(
        `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes) VALUES (?,?,?,?)`,
        [APPT, "scheduled", "cancelled",
         `Stale row from a MoeGo reschedule: booking ${BOOKING} moved from 19/11 to 11/11 and both dogs are live there. Cancelled by the 29/10/2026 MoeGo sync.`]);
      await c.commit();
      console.log("\nCOMMITTED");
    } else { await c.rollback(); console.log("\nrolled back (dry)"); }
  } catch (e: any) {
    await c.rollback();
    console.log(`ROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

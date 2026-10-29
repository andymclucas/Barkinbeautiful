/**
 * Cancel Freddie's 30/10 row. Andy approved 29/10/2026.
 *
 * Freddie was marked departed on 22/10/2026. MoeGo booking 132615333 is
 * Banjo alone at $163 — Jen Cardaci's only booking in the window — and
 * the only Freddie in MoeGo belongs to another client. Groomigo's
 * Freddie row shares Banjo's booking id and carries a duplicate $163.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
const APPLY = process.argv.includes("--apply");
const APPT = 1200956;        // confirmed below before anything is written

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  await c.beginTransaction();
  try {
    const [rows] = await c.query<any[]>(
      `SELECT a.id, p.name dog, p.status petStatus, a.price, a.workflow_state, a.moego_appointment_id bid,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"),'%d/%m %H:%i') t
         FROM appointments a JOIN pets p ON p.id=a.pet_id
        WHERE a.moego_appointment_id='132615333' AND a.workflow_state NOT IN ('cancelled','no_show')`);
    const freddie = rows.find((r) => r.dog === "Freddie");
    const banjo = rows.find((r) => r.dog === "Banjo");
    if (!freddie) throw new Error("no live Freddie row on that booking");
    if (!banjo || banjo.workflow_state !== "scheduled") throw new Error("Banjo is not live on that booking — refusing, this would empty it");
    if (freddie.petStatus !== "departed") throw new Error(`Freddie's pet status is ${freddie.petStatus}, not departed — refusing`);

    console.log(`cancelling: appt ${freddie.id}  ${freddie.t}  Freddie  $${freddie.price}  (pet status: ${freddie.petStatus})`);
    console.log(`keeping:    appt ${banjo.id}  ${banjo.t}  Banjo  $${banjo.price}`);

    if (APPLY) {
      const [res] = await c.query<any>(
        `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
          WHERE id=? AND workflow_state='scheduled'`, [freddie.id]);
      if (res.affectedRows !== 1) throw new Error(`affected ${res.affectedRows} rows, expected 1`);
      await c.query(
        `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes) VALUES (?,?,?,?)`,
        [freddie.id, "scheduled", "cancelled",
         "Freddie was marked departed on 22/10/2026 and MoeGo booking 132615333 is Banjo alone. Cancelled by the 29/10/2026 MoeGo sync."]);
      await c.commit(); console.log("\nCOMMITTED");
    } else { await c.rollback(); console.log("\nrolled back (dry)"); }
  } catch (e: any) {
    await c.rollback(); console.log(`ROLLED BACK — nothing written. ${e.message}`); process.exitCode = 1;
  }
  await c.end();
})();

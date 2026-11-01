/**
 * Torah's half of booking #95442576.
 *
 * Andy, 01/11/2026: "Fix Torah too."
 *
 *   corepack pnpm exec tsx scripts/moego-fix-torah-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-fix-torah-2026-11-01.ts --apply
 *
 * MoeGo's booking prices the two dogs at $117.00 each and totals $234.00.
 * Groomigo had the whole BOOKING total on Torah alone, so the counter
 * would have charged her $117 too much on Tuesday. It also had her with
 * Megs Graham; MoeGo has her with Brooklyn and Louis with Megan.
 *
 * Read off the booking panel itself, not inferred:
 *   Torah · Diamond - Gold (up to 6wks) -SML-10kg- Style Full Groom
 *         · 08:30 am · $117.00 · 90 mins · Brooklyn
 *
 * Guarded on the current price as well as pet, client and state, so it
 * cannot run twice and cannot touch a row somebody has since corrected.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

const TORAH = {
  appointmentId: 1230101,
  petName: "Torah",
  clientName: "Varinia Taylor",
  day: "2026-11-03",
  from: { price: "234.00", staffId: 2 },
  to: { price: "117.00", staffId: 5 }, // Brooklyn Cossey
};

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const show = async () => {
    const [r]: any = await c.query(
      `SELECT a.id, p.name pet, CONCAT(cl.first_name,' ',cl.last_name) client,
              a.service_type, a.price, a.staff_id, s.name groomer, a.workflow_state,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d %H:%i') starts
         FROM appointments a
         LEFT JOIN pets p ON p.id=a.pet_id
         LEFT JOIN clients cl ON cl.id=a.client_id
         LEFT JOIN staff s ON s.id=a.staff_id
        WHERE a.id=? AND a.tenant_id=?`, [TORAH.appointmentId, TENANT]);
    return r[0];
  };

  const before = await show();
  console.log("BEFORE"); console.table([before]);

  const fail = (m: string) => { console.error("ABORT:", m); process.exit(1); };
  if (!before) fail("row not found");
  if (before.pet !== TORAH.petName || before.client !== TORAH.clientName) fail("pet/client mismatch");
  if (!before.starts.startsWith(TORAH.day)) fail(`slot is ${before.starts}`);
  if (before.workflow_state !== "scheduled") fail(`state is ${before.workflow_state}`);
  if (String(before.price) !== TORAH.from.price) fail(`price is ${before.price}, expected ${TORAH.from.price} — already changed?`);

  console.log(`\nwould set: $${TORAH.from.price} -> $${TORAH.to.price}, groomer ${before.groomer} -> Brooklyn Cossey`);
  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  const [res]: any = await c.query(
    `UPDATE appointments a
        JOIN pets p ON p.id=a.pet_id
        JOIN clients cl ON cl.id=a.client_id
        SET a.price=?, a.staff_id=?
      WHERE a.id=? AND a.tenant_id=? AND a.workflow_state='scheduled'
        AND a.price=? AND p.name=? AND CONCAT(cl.first_name,' ',cl.last_name)=?`,
    [TORAH.to.price, TORAH.to.staffId, TORAH.appointmentId, TENANT,
     TORAH.from.price, TORAH.petName, TORAH.clientName]);
  if (res.affectedRows !== 1) { console.error(`ABORT: affected ${res.affectedRows} rows, expected 1`); process.exit(1); }

  console.log("\nAFTER"); console.table([await show()]);
  const [sum]: any = await c.query(
    `SELECT ROUND(SUM(price),2) groomigo_total FROM appointments
      WHERE tenant_id=? AND moego_appointment_id='95442576'
        AND workflow_state NOT IN ('cancelled','no_show')`, [TENANT]);
  console.log(`booking total now $${sum[0].groomigo_total} — MoeGo says $234.00`);
  await c.end();
})();

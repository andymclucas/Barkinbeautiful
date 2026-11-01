/**
 * Give every imported multi-dog booking a shared sessionId, so its dogs
 * land on ONE invoice.
 *
 * Lauren, 02/11/2026: "I noticed double dog appointments when
 * transferred I need to cancel the appointment out in Groomigo first to
 * put them on the same invoice. Then add them both."
 *
 *   corepack pnpm exec tsx scripts/backfill-session-ids-2026-11-02.ts          # dry run
 *   corepack pnpm exec tsx scripts/backfill-session-ids-2026-11-02.ts --apply
 *
 * `sessionId` is what ties several dogs into one visit. `billFor` in
 * server/routers/payments.ts reads it: with a sessionId it gathers every
 * appointment sharing it, and WITHOUT one it bills `[appointment]` — the
 * single dog. The booking flow sets it (`petIds.length > 1 ? nanoid(16)
 * : null`) in all three create paths.
 *
 * Every import wrote appointments straight into the table and set none,
 * mine included. So a two-dog MoeGo booking arrived as two unrelated
 * appointments and could not be billed together, which is exactly the
 * cancel-and-re-add Lauren has been doing by hand: re-booking the pair
 * through the app is what minted the sessionId.
 *
 * One MoeGo booking id on one Brisbane day for one client is one visit,
 * which is the same key the imports already use to avoid duplicating a
 * dog. Groups where any dog ALREADY has a sessionId are left alone
 * rather than merged — somebody booked those through the app and that
 * grouping is theirs.
 *
 * Scoped to appointments that have not happened yet. A past visit's
 * invoice is history, and regrouping what was already billed would
 * rewrite it.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { nanoid } from "nanoid";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [groups]: any = await c.query(`
    SELECT moego_appointment_id mo,
           DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d,
           client_id,
           COUNT(*) dogs,
           SUM(session_id IS NULL) nulls,
           GROUP_CONCAT(id ORDER BY id) ids
      FROM appointments
     WHERE tenant_id=?
       AND moego_appointment_id IS NOT NULL
       AND workflow_state NOT IN ('cancelled','no_show')
       AND scheduled_start >= NOW()
     GROUP BY mo, d, client_id
    HAVING dogs > 1
     ORDER BY d, mo`, [TENANT]);

  const todo = groups.filter((g: any) => Number(g.nulls) === Number(g.dogs));
  const partial = groups.filter((g: any) => Number(g.nulls) > 0 && Number(g.nulls) < Number(g.dogs));
  const already = groups.length - todo.length - partial.length;

  const [names]: any = await c.query(
    `SELECT a.id, p.name pet, CONCAT(cl.first_name,' ',cl.last_name) client
       FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients cl ON cl.id=a.client_id
      WHERE a.tenant_id=? AND a.id IN (${todo.flatMap((g: any) => g.ids.split(',')).join(',') || 0})`, [TENANT]);
  const label = new Map(names.map((n: any) => [String(n.id), n]));

  for (const g of todo.slice(0, 12)) {
    const ids = g.ids.split(',');
    const first: any = label.get(ids[0]);
    console.log(`${g.d.toISOString().slice(0,10)}  #${g.mo}  ${first?.client ?? "?"} — ` +
      ids.map((i: string) => (label.get(i) as any)?.pet ?? i).join(" + "));
  }
  if (todo.length > 12) console.log(`   … and ${todo.length - 12} more`);

  console.log(`\nupcoming multi-dog bookings:        ${groups.length}`);
  console.log(`  already share a sessionId:        ${already}`);
  console.log(`  partly set — LEFT ALONE:          ${partial.length}`);
  console.log(`  to be grouped:                    ${todo.length}  (${todo.reduce((n: number, g: any) => n + Number(g.dogs), 0)} dogs)`);
  partial.forEach((g: any) => console.log(`     partial: #${g.mo} on ${g.d.toISOString().slice(0,10)} — ${g.nulls}/${g.dogs} unset`));

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    let n = 0;
    for (const g of todo) {
      const ids = g.ids.split(',').map(Number);
      const sid = nanoid(16);
      const [res]: any = await c.query(
        `UPDATE appointments SET session_id=?
          WHERE tenant_id=? AND id IN (${ids.map(() => '?').join(',')}) AND session_id IS NULL`,
        [sid, TENANT, ...ids]);
      if (res.affectedRows !== ids.length) {
        throw new Error(`#${g.mo} on ${g.d.toISOString().slice(0,10)}: updated ${res.affectedRows} of ${ids.length}`);
      }
      n += res.affectedRows;
    }
    await c.commit();
    console.log(`\ncommitted — ${todo.length} bookings grouped, ${n} appointments given a sessionId`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();

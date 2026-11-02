/**
 * Tell Groomigo the team is out on Friday 13 November.
 *
 * Andy, 02/11/2026: "Sort the Friday 13th blocks."
 *
 * ## What is actually going on
 *
 * MoeGo has seven "Girls weekend" blocks on Friday 13 November: all day
 * against Megan, Charlotte, Zakaria, Brooklyn and Ashleigh, and
 * 11:00–16:00 against Lauren and Bather 1. Twenty-six dogs are booked
 * the same day, which looked like a clash and is not. Every dog is in
 * before 11:30 and out by 12:30, and only five are still in the salon
 * after 11:00. The team is working the Friday morning and leaving at
 * lunch, which is exactly what the 11:00 block says.
 *
 * So the bookings are fine and nothing needs moving. What is NOT fine
 * is that Groomigo had never heard of any of it: blockouts do not sync,
 * and this database had none for that day. Online booking is ON
 * (`tenants.online_booking_enabled = 1`), `nextAvailable` and
 * `monthCapacity` both read blockouts, so a client could book Friday
 * afternoon and arrive to an empty salon.
 *
 * ## Why 11:00–16:00 for everybody
 *
 * It is the one girls-weekend window the salon has actually written
 * down — MoeGo's own times on Lauren and the bather — so no part of it
 * is invented here.
 *
 * MoeGo's all-day blocks on the other five are NOT copied. They
 * contradict those same five people having twenty-six dogs booked that
 * morning, and copying them would have told monthCapacity the day was
 * empty and put a leave badge beside a groomer standing at the table.
 * An afternoon block is true for all seven; an all-day one is true for
 * nobody.
 *
 *   corepack pnpm exec tsx scripts/block-girls-weekend-2026-11-13.ts          # dry run
 *   corepack pnpm exec tsx scripts/block-girls-weekend-2026-11-13.ts --apply
 *
 * Blockouts never touch an appointment, so the morning's dogs are
 * unaffected. This only stops something NEW being booked into the
 * afternoon.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const DAY = "2026-11-13";
const START = "11:00";
const END = "16:00";
const REASON = "Girls weekend (from MoeGo)";
const GROUP = "girls-weekend-2026-11-13";

/**
 * The seven MoeGo names, mapped to Groomigo's. MoeGo writes "Megan
 * Graham" where Groomigo has "Megs Graham", and its "Bather 1" is
 * Stephanie Baldwin.
 *
 * Groomigo has five more active staff that MoeGo does not track —
 * Akilah, Sabina, Bailey and the two managers. They are deliberately
 * left alone: nothing says they are away, and blocking somebody on a
 * guess is how a real shift goes missing.
 */
const STAFF: { id: number; name: string }[] = [
  { id: 1, name: "Lauren Romari" },
  { id: 2, name: "Megs Graham" },
  { id: 3, name: "Charlotte Purcell" },
  { id: 4, name: "Zakaria Romari" },
  { id: 5, name: "Brooklyn Cossey" },
  { id: 6, name: "Ashleigh Knight" },
  { id: 7, name: "Stephanie Baldwin" },
];

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [existing]: any = await c.query(
    `SELECT staff_id, start_time, end_time, is_full_day, reason FROM staff_blockouts
      WHERE tenant_id=? AND DATE(blockout_date)=?`, [TENANT, DAY]);
  if (existing.length) {
    console.log(`${DAY} already has ${existing.length} blockout(s) — nothing to do:`);
    console.table(existing);
    await c.end();
    return;
  }

  const [dogs]: any = await c.query(
    `SELECT COUNT(*) n,
            MIN(TIME(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))) first_in,
            MAX(TIME(CONVERT_TZ(scheduled_end,'+00:00','+10:00'))) last_out
       FROM appointments
      WHERE tenant_id=? AND workflow_state NOT IN ('cancelled','no_show')
        AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))=?`, [TENANT, DAY]);
  console.log(`${DAY}: ${dogs[0].n} dogs booked, ${dogs[0].first_in} to ${dogs[0].last_out} — untouched by this.`);
  console.log(`Blocking ${START}–${END} for ${STAFF.length} staff:`);
  STAFF.forEach((s) => console.log(`   ${s.name}`));

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const s of STAFF) {
      const [res]: any = await c.query(
        `INSERT INTO staff_blockouts
           (tenant_id, staff_id, blockout_date, start_time, end_time, is_full_day, reason, group_id)
         VALUES (?,?,?,?,?,0,?,?)`,
        [TENANT, s.id, DAY, START, END, REASON, GROUP]);
      if (res.affectedRows !== 1) throw new Error(`${s.name}: insert affected ${res.affectedRows}`);
    }
    await c.commit();
    console.log(`\ncommitted — ${STAFF.length} blockouts for ${DAY} ${START}–${END}`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();

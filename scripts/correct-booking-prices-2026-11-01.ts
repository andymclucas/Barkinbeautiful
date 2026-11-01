/**
 * Put the right price on the twelve dogs priced yesterday, and on Momo.
 *
 * ## What went wrong
 *
 * `scripts/price-unpriced-bookings-2026-11-01.ts` priced thirteen dogs
 * from the catalogue. It selected them with `membership_id IS NULL` and
 * read that as "not a member", then argued from October's medians that
 * the right tier was VIP.
 *
 * `membership_id` is null for EVERY MoeGo member in this database,
 * because the memberships have not been migrated across — not because
 * the client has no membership. The signal that actually exists is in
 * MoeGo's SERVICE NAME, which spells the plan out:
 *
 *   "Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic"  -> covered, $0
 *   "Bronze (8wks) -SML -10kg- Full Groom- Classic"            -> Regular, $125
 *   "Tidy - Small size or short hair"                          -> $88
 *
 * So nine of the twelve are membership grooms that carry no price at
 * all, and the other three are Regular clients at $125 rather than the
 * $110 VIP rate I used. Checked against MoeGo's own booking totals:
 * 125 + 125 = $250 and 125 + 88 = $213, both exact.
 *
 * Left as it was: the October-median reasoning was sound for a casual
 * client and is still how an unpriced non-member should be priced. It
 * was applied to members, which is the mistake.
 *
 *   corepack pnpm exec tsx scripts/correct-booking-prices-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/correct-booking-prices-2026-11-01.ts --apply
 *
 * Each row is guarded on the price it is expected to be carrying, so
 * this cannot run twice and cannot overwrite a figure somebody has
 * since corrected by hand.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

type Fix = { pet: string; client: string; from: string | null; to: string; plan: string };

/** Every price read from MoeGo's own booking, not derived. */
const FIXES: Fix[] = [
  // Diamond - Gold: the membership covers the groom.
  { pet: "Alfie",  client: "Lisa Smith",        from: "110.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Neymar", client: "Mellissa Luckman",  from: "110.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Junior", client: "Mellissa Luckman",  from: "145.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Alex",   client: "Mellissa Luckman",  from: "110.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Teddy",  client: "Clare De Looze",    from: "260.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Raven",  client: "Paris Manteit",     from: "110.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Nova",   client: "Jade Manteit",      from: "145.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Albert", client: "Jackie Hartney",    from: "200.00", to: "0.00", plan: "Diamond-Gold" },
  { pet: "Luna",   client: "Carmel Holliday",   from: "110.00", to: "0.00", plan: "Diamond-Gold" },
  // Bronze is the Regular tier: $125, not the $110 VIP rate.
  { pet: "Maple",  client: "Kat Weatherley",    from: "110.00", to: "125.00", plan: "Bronze" },
  { pet: "Molly",  client: "Kat Weatherley",    from: "110.00", to: "125.00", plan: "Bronze" },
  { pet: "Lily",   client: "Kristina Farr",     from: "110.00", to: "125.00", plan: "Bronze" },
  // Left blank yesterday because coat length is a groomer's call. MoeGo
  // settles it: the service is "Tidy - Small size or short hair".
  { pet: "Momo",   client: "Kristina Farr",     from: null,     to: "88.00",  plan: "Tidy, short hair" },
];

const FROM = "2026-11-03", TO = "2026-11-09";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const load = async (f: Fix) => {
    const [r]: any = await c.query(
      `SELECT a.id, p.name pet, CONCAT(cl.first_name,' ',cl.last_name) client,
              a.price, a.workflow_state,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%d/%m %H:%i') slot
         FROM appointments a
         JOIN pets p ON p.id=a.pet_id
         JOIN clients cl ON cl.id=a.client_id
        WHERE a.tenant_id=? AND p.name=? AND CONCAT(cl.first_name,' ',cl.last_name)=?
          AND a.status NOT IN ('cancelled','no_show')
          AND a.workflow_state NOT IN ('cancelled','no_show')
          AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') >= ?
          AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') <  ?`,
      [TENANT, f.pet, f.client, FROM, TO]);
    return r;
  };

  let ready = 0, skipped = 0, delta = 0;
  for (const f of FIXES) {
    const rows = await load(f);
    if (rows.length !== 1) {
      console.log(`SKIP  ${f.pet} (${f.client}) — matched ${rows.length} rows, expected 1`);
      skipped++; continue;
    }
    const r = rows[0];
    const current = r.price === null ? null : String(r.price);
    if (current !== f.from) {
      console.log(`SKIP  ${f.pet} (${f.client}) — price is $${current}, expected $${f.from} (already changed?)`);
      skipped++; continue;
    }
    console.log(`  ${r.slot}  ${f.pet.padEnd(8)} ${f.client.padEnd(18)} $${current ?? "—"} -> $${f.to}   [${f.plan}]`);
    delta += Number(f.to) - Number(current ?? 0);
    ready++;
  }
  console.log(`\n${ready} to correct, ${skipped} skipped. Net change to the week: $${delta.toFixed(2)}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    let done = 0;
    for (const f of FIXES) {
      const [res]: any = await c.query(
        `UPDATE appointments a
            JOIN pets p ON p.id=a.pet_id
            JOIN clients cl ON cl.id=a.client_id
            SET a.price=?
          WHERE a.tenant_id=? AND p.name=? AND CONCAT(cl.first_name,' ',cl.last_name)=?
            AND a.status NOT IN ('cancelled','no_show')
            AND a.workflow_state NOT IN ('cancelled','no_show')
            AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') >= ?
            AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') <  ?
            AND ${f.from === null ? "(a.price IS NULL OR a.price=0)" : "a.price=?"}`,
        f.from === null
          ? [f.to, TENANT, f.pet, f.client, FROM, TO]
          : [f.to, TENANT, f.pet, f.client, FROM, TO, f.from]);
      if (res.affectedRows > 1) throw new Error(`${f.pet}: affected ${res.affectedRows} rows`);
      done += res.affectedRows;
    }
    await c.commit();
    console.log(`\ncommitted — ${done} rows corrected`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  const [after]: any = await c.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%d/%m') day,
            p.name pet, CONCAT(cl.first_name,' ',cl.last_name) client, a.price
       FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients cl ON cl.id=a.client_id
      WHERE a.tenant_id=? AND p.name IN (${FIXES.map(() => "?").join(",")})
        AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') >= ?
        AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') <  ?
      ORDER BY a.scheduled_start`,
    [TENANT, ...FIXES.map((f) => f.pet), FROM, TO]);
  console.table(after);
  await c.end();
})();

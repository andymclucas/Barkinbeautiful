/**
 * Bring the salon's retail products across from MoeGo.
 *
 * Andy, 05/11/2026: "Do a migration for retail from MoeGo to Groomigo...
 * Stock numbers may be not quite right but let's merge it as is for now
 * with the function to manually adjust numbers once they're in."
 *
 *   corepack pnpm exec tsx scripts/moego-retail-2026-11-05.ts
 *   corepack pnpm exec tsx scripts/moego-retail-2026-11-05.ts --apply
 *
 * Pulled from MoeGo's Retail → Products on 05/11/2026: 72 rows.
 *
 * ## What MoeGo actually had
 *
 * Name, stock and price. SKU, barcode, category and supplier are EMPTY
 * on 71 of the 72, so there is nothing to carry across in those
 * columns and no point pretending otherwise — they are left null for
 * the salon to fill in from the new screen if they ever want them.
 *
 * The 72nd is "Dog food", SKU 123123255232, supplier "Mega dog food
 * llc", with a price cell reading "120.0011.00" — a price and a cost
 * run together. That is MoeGo's own sample product, not something this
 * salon sells, and it is deliberately NOT imported.
 *
 * ## Stock comes across as it stands, negatives and all
 *
 * 30 of the 71 are negative — Ice Cream at -47, several treats in the
 * -20s and -30s. That is a till that has been selling things it was
 * never told it received, not a bug to fix here, and Andy asked for it
 * as-is so the numbers can be corrected against a real count rather
 * than guessed at by a script.
 *
 * ## Idempotent on name
 *
 * Matching is on the product name within the tenant, so a second run
 * updates rather than duplicates. There is no MoeGo id on the row to
 * match on — the export does not carry one.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

/** name | stock | price */
const RAW = `
Barkin Beautiful Slicker Brush|287|30.00
BLD step in harness XSMALL|2|34.00
BLD Step in Harness Small|0|36.00
BLD Adjustable Harness - Medium|2|46.00
BLD Adjustable Harness - Small|6|41.00
Treats - Peanut Butter Biscuits|-28|2.00
Treats - Lamb puff bags 50g|7|12.00
Treats - Roo Jerky tendons|-35|4.00
Treats- Cheese & Bacon Biscuits|-38|3.00
Treat - Beef Knee caps|-19|4.00
Tropiclean Teeth Gel 59ml|2|30.99
Tropiclean Teeth Gel 118ml|1|41.99
ProGroom Cologne 250 ml|-1|22.50
Urine Off|-1|16.95
Tropiclean Fresh Breath Water Additive ORIGINAL|2|35.99
Tropiclean Fresh Breath (dental wipes)|-1|26.99
Tropiclean Fresh Breath (dental kit - SML)|-1|35.99
Tropiclean Fresh Breath (dental kit - LRG)|0|35.99
Tropiclean Fresh Breath (water additive)|-1|29.00
Tropiclean Fresh Breath (oral spray)|5|24.95
Tickless Colar|0|70.00
Tasty Bone Nylon Trio LRG|0|44.99
Tasty Bone Nylon Trio SML|-1|37.99
Tasty Bone Dental Sticks|0|20.00
Slicker brush SML|0|18.00
Slicker brush|0|28.00
Obedience Collar XL|0|25.00
Obedience Collar non slip SML|0|15.00
Obedience Collar LRG|0|23.00
Obedience Colla MED|-1|18.00
Miscellaneous|-15|0.00
Gift Voucher|0|0.00
Dog coat|0|25.00
Comb with handle|0|25.00
Comb (metal)|0|26.00
Carpet Cleaner|0|34.99
Car restraint headrest|0|25.95
Car Restraint BLD|0|25.95
Bubble Bowl - Lrg|0|31.95
Toys|-3|20.00
BLD Leash - 1.5cm|-1|29.95
BLD Harness Reversable - S|0|42.95
BLD Harness Reversable - M|-1|44.95
BLD Harness Reversable - L|0|46.95
BLD Collar - M|-1|31.95
BLD Collar - S|-4|29.95
BLD Collar - L|0|32.95
BLD Collar - XS|0|26.95
BLD All Rounder Harness - M|0|58.95
BLD All Rounder Harness - XS|-1|36.95
BLD All Rounder Harness - XL|0|45.95
BLD All Rounder Harness - L|-4|43.95
BLD Adjustable Harness - Lrg|-2|43.95
BLD - XS Harness|-1|36.95
BLD - Rashie - SML|0|33.95
BLD - Rashie - MED|0|34.95
BECO poo bags multi pack 270|0|20.00
BECO poo bags 120pk|-1|14.99
BECO Bag Handles 96 Compostable|0|24.00
BLD Allrounder harness SML|5|57.95
Treats - Green Lipped Mussels|-2|24.95
Treats - Liver treat sticks|-19|3.00
Treats - Kangaroo Jerky|-26|3.00
Treats - Veal Spare Ribs|-38|3.00
Treats - Lamb Stix|-35|3.00
Treats - Duck Feet|-8|2.00
Treats - Beef Stix|-27|3.00
Treats - Chicken Tenderloin|6|4.00
Treats - Pig Ears|-9|3.00
Ice Cream (all flavours)|-47|7.50
Hydra Cologne SMALL 130ml|0|27.00
`.trim();

const products = RAW.split("\n").map((line) => {
  const [name, stock, price] = line.split("|");
  return { name: name.trim(), stockQty: Number(stock), priceAud: price.trim() };
});

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [existing]: any = await c.query(
    "SELECT id, name FROM retail_products WHERE tenant_id=?", [TENANT]);
  const byName = new Map<string, number>(
    existing.map((row: any) => [String(row.name).trim().toLowerCase(), row.id]));

  const toCreate = products.filter((p) => !byName.has(p.name.toLowerCase()));
  const toUpdate = products.filter((p) => byName.has(p.name.toLowerCase()));
  const negative = products.filter((p) => p.stockQty < 0);

  console.log(`MoeGo products read : ${products.length}`);
  console.log(`  new in Groomigo   : ${toCreate.length}`);
  console.log(`  already there     : ${toUpdate.length} (stock and price refreshed)`);
  console.log(`  negative stock    : ${negative.length} — carried across as-is, to be counted and corrected`);
  console.log(`  free items ($0)   : ${products.filter((p) => Number(p.priceAud) === 0).map((p) => p.name).join(", ")}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    let created = 0, updated = 0;
    for (const p of products) {
      const id = byName.get(p.name.toLowerCase());
      if (id) {
        const [res]: any = await c.query(
          "UPDATE retail_products SET stock_qty=?, price_aud=?, updated_at=NOW() WHERE id=? AND tenant_id=?",
          [p.stockQty, p.priceAud, id, TENANT]);
        if (res.affectedRows > 1) throw new Error(`${p.name}: updated ${res.affectedRows} rows`);
        updated++;
      } else {
        const [res]: any = await c.query(
          "INSERT INTO retail_products (tenant_id, name, price_aud, stock_qty, reorder_threshold, is_active) VALUES (?,?,?,?,?,1)",
          [TENANT, p.name, p.priceAud, p.stockQty, 5]);
        if (res.affectedRows !== 1) throw new Error(`${p.name}: inserted ${res.affectedRows} rows`);
        created++;
      }
    }
    if (created + updated !== products.length) {
      throw new Error(`touched ${created + updated}, expected ${products.length}`);
    }
    await c.commit();
    console.log(`\ncommitted — ${created} created, ${updated} updated`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  const [[after]]: any = await c.query(
    "SELECT COUNT(*) n, SUM(stock_qty < 0) negative FROM retail_products WHERE tenant_id=?", [TENANT]);
  console.log(`retail_products now holds ${after.n} products, ${after.negative} with negative stock`);
  await c.end();
})();

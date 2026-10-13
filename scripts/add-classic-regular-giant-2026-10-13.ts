/**
 * Add the one missing Regular Client price: Full Groom (Classic) - Giant.
 *
 * Four (service, band, tier) combinations were absent from the price list.
 * MoeGo does not have any of them — checked on 13/10/2026 against Settings →
 * Services (46 active, 25 inactive all at $0.00), the membership plans, and a
 * full week of live bookings, in which no Bronze styled booking appears at
 * 11-13, 14-16 or 26-34kg and no Bronze giant appears at all.
 *
 * So unlike scripts/align-catalogue-with-moego-2026-10-13.ts, this figure is
 * NOT read from MoeGo. It is derived, and only this one is derivable:
 *
 *   1. VIP ÷ Regular is tight across every classic band that has both —
 *      110/125 = 0.880, 145/163 = 0.890, 176/200 = 0.880, 200/225 = 0.889,
 *      260/290 = 0.897. VIP Giant is $290, and $290/$325 = 0.892, dead
 *      centre of that range.
 *   2. Regular equals New at classic 11-13kg ($163) and classic 14-16kg
 *      ($200). New Giant is $325.
 *
 * Two independent lines land on the same number, which is why this row is
 * safe to add and the three styled ones are not. Those stay empty on Andy's
 * instruction (13/10/2026): styled 11-13kg Regular derives to $202 from the
 * VIP ratio but $181 from the reg/new ratio, and $202 is more than the $200 a
 * first-time client pays. A contradiction like that cannot be rounded away.
 *
 * Run with no arguments for a dry run.
 *   node scripts/add-classic-regular-giant-2026-10-13.ts
 *   node scripts/add-classic-regular-giant-2026-10-13.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const TENANT_ID = 1;

const CODE = "full-groom-classic-regular-client-giant";
const NAME = "Full Groom (Classic) - Regular Client - Giant";
const BAND = "36-80kg";
const PRICE = "325.00";

/**
 * The derivation rests entirely on these two rows. If either has been edited
 * in Settings since this was written, $325 no longer follows and the script
 * must refuse rather than write a stale number.
 */
const ANCHORS: Array<{ id: number; price: string; what: string }> = [
  { id: 25, price: "290.00", what: "Full Groom (Classic) - VIP Client - Giant" },
  { id: 10, price: "325.00", what: "Full Groom (Classic) - New Client - Giant" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const problems: string[] = [];

  const [anchorRows] = await db.query<any[]>(
    "SELECT id, name, price_aud, weight_band, is_active FROM pricing_services WHERE tenant_id = ? AND id IN (?)",
    [TENANT_ID, ANCHORS.map((a) => a.id)],
  );
  const byId = new Map(anchorRows.map((r: any) => [r.id, r]));
  for (const a of ANCHORS) {
    const row = byId.get(a.id);
    if (!row) problems.push(`anchor id ${a.id} (${a.what}) is gone`);
    else if (String(row.price_aud) !== a.price)
      problems.push(`anchor id ${a.id} is now $${row.price_aud}, expected $${a.price} — derivation void`);
    else if (!row.is_active) problems.push(`anchor id ${a.id} has been deactivated — derivation void`);
    else if (String(row.weight_band) !== BAND)
      problems.push(`anchor id ${a.id} is banded ${row.weight_band}, expected ${BAND}`);
  }

  // Don't add a second Giant regular row beside one somebody has since
  // entered by hand in Settings — match on the band and tier, not just the
  // code, because a hand-entered row would carry a different code.
  const [clashes] = await db.query<any[]>(
    `SELECT id, name, code, price_aud FROM pricing_services
      WHERE tenant_id = ? AND catalogue_type = 'service'
        AND legacy_service_type = 'classic_groom' AND weight_band = ?
        AND (code = ? OR name LIKE '%Regular Client%')`,
    [TENANT_ID, BAND, CODE],
  );
  for (const c of clashes) problems.push(`already present: id ${c.id} "${c.name}" at $${c.price_aud}`);

  if (problems.length > 0) {
    console.log("\nNot safe to write:\n");
    for (const p of problems) console.log(`  ${p}`);
    console.log("\nNothing written.\n");
    await db.end();
    process.exit(1);
  }

  const vip = Number(ANCHORS[0].price);
  console.log(`\n${apply ? "APPLYING" : "DRY RUN"}\n`);
  console.log(`  Add  $${PRICE}  ${NAME}`);
  console.log(`         band ${BAND}, classic_groom, code ${CODE}`);
  console.log(`         derived: VIP $${vip.toFixed(2)} / $${PRICE} = ${(vip / Number(PRICE)).toFixed(3)}`);
  console.log(`         (classic VIP/Regular runs 0.880-0.897 across every band that has both)`);
  console.log(`         and Regular = New at classic 11-13kg and 14-16kg; New Giant is $325.00`);

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply.\n");
    await db.end();
    return;
  }

  const [[maxRow]] = await db.query<any[]>(
    "SELECT MAX(sort_order) AS s FROM pricing_services WHERE tenant_id = ?",
    [TENANT_ID],
  );
  const sortOrder = Number(maxRow.s ?? 0) + 1;

  await db.beginTransaction();
  try {
    const [res] = await db.query<any>(
      `INSERT INTO pricing_services
         (tenant_id, catalogue_type, name, code, price_mode, price_aud,
          legacy_service_type, weight_band, is_active, sort_order)
       VALUES (?, 'service', ?, ?, 'fixed', ?, 'classic_groom', ?, 1, ?)`,
      [TENANT_ID, NAME, CODE, PRICE, BAND, sortOrder],
    );
    if (res.affectedRows !== 1) throw new Error(`insert touched ${res.affectedRows} rows`);
    await db.commit();
    console.log(`\nDone: 1 added (id ${res.insertId}, sort_order ${sortOrder}).`);
    console.log("The booking dialog reads the catalogue live — no deploy needed.\n");
  } catch (error) {
    await db.rollback();
    console.error("\nRolled back, nothing changed:", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

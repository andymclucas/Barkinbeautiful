/**
 * Bring the Groomigo price list back into line with MoeGo.
 *
 * Checked against MoeGo's Settings → Services on 13/10/2026 (46 active
 * services, plus 25 inactive ones all at $0.00). The tier mapping, confirmed
 * by exact matches on fourteen rows:
 *
 *   Diamond - Gold (up to 6wks)  →  "VIP Client"
 *   Bronze (8wks)                →  "Regular Client"
 *   Casual / NEW customer        →  "New Client"
 *
 * Every figure below is read from MoeGo. Nothing is derived.
 *
 * Run with no arguments for a dry run.
 *   node scripts/align-catalogue-with-moego-2026-10-13.ts
 *   node scripts/align-catalogue-with-moego-2026-10-13.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const TENANT_ID = 1;

/** Prices that simply disagree with MoeGo. */
const REPRICE: Array<{ id: number; was: string; now: string; why: string }> = [
  {
    id: 2, was: "163.00", now: "180.00",
    // The worst of them. $163.00 is MoeGo's BRONZE styled small — the
    // regular-client rate — sitting under a New Client label, so every
    // first-time small styled groom has been quoted $17 light.
    why: "MoeGo: Casual / NEW customer SML STYLE10kg Full Groom Small",
  },
  { id: 6, was: "225.00", now: "230.00", why: "MoeGo: Casual/ New Client -Med 14-16kg- Style Groom" },
  { id: 13, was: "162.50", now: "163.00", why: "MoeGo: Bronze (8wks)- SML-MED 11-13KG -Full Groom- Classic" },
  { id: 17, was: "287.50", now: "290.00", why: "MoeGo: Bronze (8wks)- XLarge26-34kg Full Groom Classic" },
];

/**
 * Rows that are not merely mispriced but describe a service MoeGo does not
 * have. Deactivated, not deleted: the flag is reversible and appointments
 * already charged at the price keep their figure either way.
 */
const DEACTIVATE: Array<{ id: number; why: string }> = [
  {
    id: 9,
    // "Full Groom (Styled) - New Client - Large (alt.)" at $290. MoeGo has
    // no styled 17-25kg at $290; its $290 is "Casual/NEW Client Large-XL
    // 20-30kg Full Groom CLASSIC". A classic price imported as styled. The
    // correct styled large already exists at $325 (id 8).
    why: "No such service in MoeGo — $290 is the Large-XL 20-30kg CLASSIC price",
  },
];

/**
 * A row filed under the wrong size.
 *
 * MoeGo's $325 classic is "Casual/NEW CLIENT -GIANT -34kg +Full Groom
 * Classic" — a GIANT price. Groomigo had it banded 26-34kg, which is why
 * Giant looked unpriced for new clients while Extra Large looked priced.
 *
 * Re-banded rather than left alone and a second Giant row added beside it:
 * that would have put two $325 rows in the list, one of them describing a
 * size MoeGo does not price. MoeGo has no Casual classic 26-34kg at all, so
 * Extra Large correctly becomes empty for new clients.
 */
const REBAND: Array<{ id: number; name: string; band: string; why: string }> = [
  {
    id: 10,
    name: "Full Groom (Classic) - New Client - Giant",
    band: "36-80kg",
    why: "MoeGo: Casual/NEW CLIENT -GIANT -34kg +Full Groom Classic ($325.00)",
  },
];

/** Prices MoeGo has and Groomigo was missing entirely. */
const ADD: Array<{ name: string; code: string; svc: string; band: string; price: string; why: string }> = [
  {
    name: "Full Groom (Styled) - Regular Client - Small",
    code: "full-groom-styled-regular-client-small",
    svc: "styled_groom", band: "0-10kg", price: "163.00",
    why: "MoeGo: Bronze (8wks) - SMALL-10kg Style Full Groom - Longer clip/ Trad",
  },
  {
    name: "Full Groom (Styled) - VIP Client - Small-Medium",
    code: "full-groom-styled-vip-client-small-medium",
    svc: "styled_groom", band: "11-13kg", price: "180.00",
    why: "MoeGo: Diamond - Gold (up to 6wks) STYLED 11-13kg - Full Groom - SML/MED",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const ids = [...REPRICE.map((r) => r.id), ...DEACTIVATE.map((r) => r.id), ...REBAND.map((r) => r.id)];
  const [current] = await db.query<any[]>(
    "SELECT id, name, price_aud, weight_band, is_active FROM pricing_services WHERE tenant_id = ? AND id IN (?)",
    [TENANT_ID, ids],
  );
  const byId = new Map(current.map((row: any) => [row.id, row]));

  // Refuse to touch a row that is not what this script was written against.
  // Somebody may have edited the list in Settings since.
  const drift: string[] = [];
  for (const r of REPRICE) {
    const row = byId.get(r.id);
    if (!row) drift.push(`id ${r.id} is gone`);
    else if (String(row.price_aud) !== r.was) drift.push(`id ${r.id} is now $${row.price_aud}, expected $${r.was}`);
  }
  for (const r of [...DEACTIVATE, ...REBAND]) if (!byId.get(r.id)) drift.push(`id ${r.id} is gone`);
  if (drift.length > 0) {
    console.log("\nThe catalogue has changed since this was written:\n");
    for (const d of drift) console.log(`  ${d}`);
    console.log("\nNothing written. Re-check against MoeGo.\n");
    await db.end();
    process.exit(1);
  }

  const [existing] = await db.query<any[]>(
    "SELECT code FROM pricing_services WHERE tenant_id = ? AND code IN (?)",
    [TENANT_ID, ADD.map((a) => a.code)],
  );
  const present = new Set(existing.map((r: any) => r.code));
  const toAdd = ADD.filter((a) => !present.has(a.code));

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"}\n`);
  console.log("  Reprice:");
  for (const r of REPRICE) console.log(`    $${r.was} -> $${r.now}  ${byId.get(r.id)!.name}\n        ${r.why}`);
  console.log("\n  Deactivate:");
  for (const r of DEACTIVATE) console.log(`    ${byId.get(r.id)!.name}\n        ${r.why}`);
  console.log("\n  Re-band:");
  for (const r of REBAND) console.log(`    ${byId.get(r.id)!.weight_band} -> ${r.band}  "${byId.get(r.id)!.name}"\n        now "${r.name}"\n        ${r.why}`);
  console.log("\n  Add:");
  for (const a of toAdd) console.log(`    $${a.price}  ${a.name}\n        ${a.why}`);
  for (const a of ADD.filter((x) => present.has(x.code))) console.log(`    = already there: ${a.code}`);

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply.\n");
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    for (const r of REPRICE) {
      const [res] = await db.query<any>(
        "UPDATE pricing_services SET price_aud = ? WHERE tenant_id = ? AND id = ? AND price_aud = ?",
        [r.now, TENANT_ID, r.id, r.was],
      );
      if (res.affectedRows !== 1) throw new Error(`reprice ${r.id} touched ${res.affectedRows} rows`);
    }
    for (const r of DEACTIVATE) {
      const [res] = await db.query<any>(
        "UPDATE pricing_services SET is_active = 0 WHERE tenant_id = ? AND id = ?",
        [TENANT_ID, r.id],
      );
      if (res.affectedRows !== 1) throw new Error(`deactivate ${r.id} touched ${res.affectedRows} rows`);
    }
    for (const r of REBAND) {
      const [res] = await db.query<any>(
        "UPDATE pricing_services SET name = ?, weight_band = ? WHERE tenant_id = ? AND id = ?",
        [r.name, r.band, TENANT_ID, r.id],
      );
      if (res.affectedRows !== 1) throw new Error(`reband ${r.id} touched ${res.affectedRows} rows`);
    }
    let sortOrder = 57;
    for (const a of toAdd) {
      sortOrder += 1;
      await db.query(
        `INSERT INTO pricing_services
           (tenant_id, catalogue_type, name, code, price_mode, price_aud,
            legacy_service_type, weight_band, is_active, sort_order)
         VALUES (?, 'service', ?, ?, 'fixed', ?, ?, ?, 1, ?)`,
        [TENANT_ID, a.name, a.code, a.price, a.svc, a.band, sortOrder],
      );
    }
    await db.commit();
    console.log(`\nDone: ${REPRICE.length} repriced, ${DEACTIVATE.length} deactivated, ${REBAND.length} re-banded, ${toAdd.length} added.`);
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

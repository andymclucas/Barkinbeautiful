/**
 * Import real pet weights from MoeGo's Pet list report.
 *
 *   corepack pnpm exec tsx scripts/moego-pet-weights.ts "<Pet list.xlsx>"          # dry run
 *   corepack pnpm exec tsx scripts/moego-pet-weights.ts "<Pet list.xlsx>" --apply  # write
 *
 * Insights -> Reports -> Pets -> "Pet list", then Export. That report is the
 * ONLY place MoeGo exposes a weight: the client export carries breed alone
 * and the appointment reports have 24 columns and no weight. Finding it is
 * why this exists.
 *
 * A measured weight beats the size band derived from a service name, so this
 * also sets the band and marks it "weighed" — a source neither this script
 * nor moego-size-bands.ts will overwrite.
 *
 * ── The guards ─────────────────────────────────────────────────────────────
 *
 *  - Dry run by default. --apply is the only way to write.
 *  - One transaction, asserting each update touched exactly one row.
 *  - Matched on moego_pet_id, MoeGo's own key, so no name matching and none
 *    of the collisions that go with it. A pet whose id is not in Groomigo is
 *    reported, never created.
 *  - Weights outside 0 < kg <= 80 are refused and listed. The export holds a
 *    305 kg dog, a 100 kg dog and a 0. Groomigo's own weight field accepts
 *    0-80 and this must not be a back door around it.
 *  - A weight already recorded is left alone unless --overwrite is passed:
 *    somebody put it there on purpose.
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSheet } from "../shared/xlsxReader.ts";
import { petWeightUpdate } from "../shared/petWeight.ts";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const OVERWRITE = args.includes("--overwrite");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error('Usage: corepack pnpm exec tsx scripts/moego-pet-weights.ts "<Pet list.xlsx>" [--apply] [--overwrite]');
  process.exit(1);
}

/** Groomigo's own bound, from pets.updateWeight. */
const MAX_KG = 80;

const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], {
  maxBuffer: 256 * 1024 * 1024,
}).toString("utf8");
// This export has no sharedStrings part — every cell is an inline string.
const rows = parseSheet(sheet, []);
if (rows.length === 0) throw new Error("No rows in the sheet");

const header = rows[0].map((c) => c.trim());
const iId = header.indexOf("Pet ID");
const iWeight = header.indexOf("Weight");
const iName = header.indexOf("Pet name");
const iOwner = header.indexOf("Owner name");
if (iId < 0 || iWeight < 0) throw new Error(`Expected "Pet ID" and "Weight" columns, got: ${header.join(", ")}`);

type Row = { moegoPetId: string; kg: number; name: string; owner: string };
const usable: Row[] = [];
const refused: Array<Row & { why: string }> = [];

for (const row of rows.slice(1)) {
  const moegoPetId = (row[iId] ?? "").trim();
  const raw = (row[iWeight] ?? "").trim();
  if (!moegoPetId || !raw) continue;
  const name = (row[iName] ?? "").trim();
  const owner = (row[iOwner] ?? "").trim();
  const kg = Number(raw);
  if (!Number.isFinite(kg)) { refused.push({ moegoPetId, kg: NaN, name, owner, why: `not a number: ${raw}` }); continue; }
  if (kg <= 0) { refused.push({ moegoPetId, kg, name, owner, why: "zero or negative" }); continue; }
  if (kg > MAX_KG) { refused.push({ moegoPetId, kg, name, owner, why: `over ${MAX_KG} kg` }); continue; }
  usable.push({ moegoPetId, kg, name, owner });
}

console.log(`\nMoeGo pet list: ${rows.length - 1} pets, ${usable.length + refused.length} with a weight`);
if (refused.length) {
  console.log(`\nRefused ${refused.length}:`);
  for (const r of refused) console.log(`  ${r.name} (${r.owner}) — ${r.why}`);
}

const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

const [petRows] = (await db.query(
  `SELECT id, moego_pet_id, name, weight_kg, size_band_source FROM pets
   WHERE tenant_id = 1 AND moego_pet_id IS NOT NULL`,
)) as any;
const byMoegoId = new Map<string, any>();
for (const p of petRows) byMoegoId.set(String(p.moego_pet_id).trim(), p);

const toWrite: Array<{ id: number; kg: number; name: string }> = [];
let noMatch = 0, alreadyWeighed = 0;
for (const row of usable) {
  const pet = byMoegoId.get(row.moegoPetId);
  if (!pet) { noMatch++; continue; }
  if (pet.weight_kg !== null && !OVERWRITE) { alreadyWeighed++; continue; }
  toWrite.push({ id: pet.id, kg: row.kg, name: row.name });
}

console.log(`\nAgainst Groomigo:`);
console.log(`  would record a weight on: ${toWrite.length} dogs`);
console.log(`  already weighed, left:    ${alreadyWeighed}${OVERWRITE ? " (--overwrite given, so none)" : ""}`);
console.log(`  no matching dog:          ${noMatch}`);

const [[activeTotal]] = (await db.query(`
  SELECT COUNT(DISTINCT p.id) c FROM pets p JOIN appointments a ON a.pet_id = p.id
  WHERE p.tenant_id = 1 AND a.scheduled_start >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`)) as any;
const ids = new Set(toWrite.map((r) => r.id));
const [activeRows] = (await db.query(`
  SELECT DISTINCT p.id FROM pets p JOIN appointments a ON a.pet_id = p.id
  WHERE p.tenant_id = 1 AND a.scheduled_start >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`)) as any;
const activeCovered = activeRows.filter((r: any) => ids.has(r.id)).length;
console.log(`\nDogs seen in the last 12 months: ${activeTotal.c}`);
console.log(`  of those, would get a real weight: ${activeCovered}`);

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${toWrite.length} weights.`);
  await db.end();
  process.exit(0);
}

await db.beginTransaction();
try {
  let written = 0;
  for (const row of toWrite) {
    // Exactly what the pet record writes when a groomer types a weight, so
    // the import and the UI cannot drift. Sets both weight columns and the
    // band, marked "weighed".
    const update = petWeightUpdate(row.kg);
    const [res] = (await db.execute(
      `UPDATE pets SET weight_kg = ?, weight = ?, size_band = ?, size_band_source = ?
       WHERE id = ? AND tenant_id = 1`,
      [update.weightKg, update.weight, update.sizeBand ?? null, update.sizeBandSource ?? null, row.id],
    )) as any;
    if (res.affectedRows !== 1) throw new Error(`pet ${row.id} (${row.name}): expected 1 row, touched ${res.affectedRows}`);
    written++;
  }
  if (written !== toWrite.length) throw new Error(`wrote ${written}, expected ${toWrite.length}`);
  await db.commit();
  console.log(`\nWROTE ${written} weights.`);
} catch (error) {
  await db.rollback();
  console.error("\nROLLED BACK:", (error as Error).message);
  process.exitCode = 1;
}
await db.end();

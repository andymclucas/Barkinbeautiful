/**
 * Import the tags MoeGo shows beside a dog's name — "✂5f, #7f, No cologne,
 * SENSITIVE" — from a MoeGo "Pet list" export.
 *
 *   node --import tsx scripts/moego-pet-codes.ts "<Pet list.xlsx>"           # dry run
 *   node --import tsx scripts/moego-pet-codes.ts "<Pet list.xlsx>" --apply   # writes
 *
 * Matches on moego_pet_id, which 12,487 of the salon's 12,542 pets carry.
 * Name matching is deliberately not attempted: there are 19 dogs called
 * Hamish, and putting "DOG AGGRESSIVE" on the wrong one is the kind of
 * mistake somebody only finds out about by being bitten.
 *
 * Writes nothing but moego_code_labels, and only where the value actually
 * differs, so a re-run is quiet and nothing else on the row is touched.
 * Clearing is deliberate too: a code removed in MoeGo should disappear here,
 * so a pet whose codes are now blank has the column set back to NULL.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import { parseSheet } from "../shared/xlsxReader.ts";
import { parsePetCodes } from "../shared/petCodes.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error('Usage: moego-pet-codes.ts "<Pet list.xlsx>" [--apply]');

const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], {
  maxBuffer: 512 * 1024 * 1024,
}).toString("utf8");
const rows = parseSheet(sheet, []);
if (rows.length === 0) throw new Error("No rows in the sheet");

const header = rows[0].map((c) => c.trim());
const iId = header.indexOf("Pet ID");
const iCodes = header.indexOf("Pet codes");
const iName = header.indexOf("Pet name");
if (iId < 0 || iCodes < 0) {
  throw new Error(`Expected "Pet ID" and "Pet codes" columns, got: ${header.join(", ")}`);
}

/** MoeGo pet id -> the codes string, normalised through the same parser the UI uses. */
const fromExport = new Map<string, { codes: string; name: string }>();
for (const row of rows.slice(1)) {
  const id = (row[iId] ?? "").trim();
  if (!id) continue;
  const codes = parsePetCodes(row[iCodes] ?? "").join(", ");
  fromExport.set(id, { codes, name: (row[iName] ?? "").trim() });
}
console.log(`Export: ${fromExport.size} pets, ${[...fromExport.values()].filter((v) => v.codes).length} with codes`);

const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL!,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

const [pets] = await db.query<any[]>(
  `SELECT id, name, moego_pet_id, moego_code_labels FROM pets
   WHERE tenant_id = 1 AND moego_pet_id IS NOT NULL AND moego_pet_id <> ''`,
);
console.log(`Groomigo: ${pets.length} pets carrying a MoeGo id\n`);

const toSet: { id: number; name: string; codes: string }[] = [];
const toClear: { id: number; name: string; was: string }[] = [];
let unchanged = 0, notInExport = 0;

for (const pet of pets) {
  const match = fromExport.get(String(pet.moego_pet_id).trim());
  if (!match) { notInExport++; continue; }
  const current = (pet.moego_code_labels ?? "").trim();
  if (match.codes === current) { unchanged++; continue; }
  if (match.codes) toSet.push({ id: pet.id, name: pet.name, codes: match.codes });
  else toClear.push({ id: pet.id, name: pet.name, was: current });
}

console.log(`would SET codes on : ${toSet.length}`);
console.log(`would CLEAR codes  : ${toClear.length}`);
console.log(`already correct    : ${unchanged}`);
console.log(`not in this export : ${notInExport}`);

console.log("\nfirst 15 to set:");
for (const p of toSet.slice(0, 15)) console.log(`   #${p.id} ${String(p.name).padEnd(12)} ${p.codes}`);
if (toClear.length) {
  console.log("\nto clear:");
  for (const p of toClear.slice(0, 10)) console.log(`   #${p.id} ${String(p.name).padEnd(12)} was: ${p.was}`);
}

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply.");
  await db.end();
  process.exit(0);
}

await db.beginTransaction();
try {
  let done = 0;
  for (const p of toSet) {
    const [res] = await db.query<any>(
      `UPDATE pets SET moego_code_labels = ?, updated_at = NOW() WHERE id = ? AND tenant_id = 1`,
      [p.codes, p.id],
    );
    if (res.affectedRows !== 1) throw new Error(`pet ${p.id}: expected 1 row, got ${res.affectedRows}`);
    done++;
  }
  for (const p of toClear) {
    const [res] = await db.query<any>(
      `UPDATE pets SET moego_code_labels = NULL, updated_at = NOW() WHERE id = ? AND tenant_id = 1`,
      [p.id],
    );
    if (res.affectedRows !== 1) throw new Error(`pet ${p.id}: expected 1 row, got ${res.affectedRows}`);
    done++;
  }
  if (done !== toSet.length + toClear.length) throw new Error("count mismatch");
  await db.commit();
  console.log(`\nCOMMITTED. ${toSet.length} set, ${toClear.length} cleared.`);
} catch (error) {
  await db.rollback();
  console.error("\nROLLED BACK — nothing changed:", (error as Error).message);
  process.exitCode = 1;
}
await db.end();

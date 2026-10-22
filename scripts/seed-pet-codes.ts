/**
 * Seed the pet-code catalogue from the codes already in use.
 *
 * The vocabulary existed before the table did: 1,384 dogs carry codes in
 * `pets.moego_code_labels`, and `shared/petCodeMeanings.ts` holds 111
 * hand-transcribed meanings. This puts both into `pet_codes` so the
 * catalogue arrives populated rather than empty, and Lauren edits it
 * from Pricing & Services instead of asking for a deploy.
 *
 * Idempotent: it skips any code already in the table, so re-running after
 * new codes appear only adds the new ones.
 *
 *   node --import tsx scripts/seed-pet-codes.ts          # dry run
 *   node --import tsx scripts/seed-pet-codes.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { PET_CODE_MEANINGS } from "../shared/petCodeMeanings";
import { parsePetCodes } from "../shared/petCodes";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

async function main() {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [petRows] = await c.query(
    `SELECT moego_code_labels v FROM pets
      WHERE tenant_id = ? AND moego_code_labels IS NOT NULL AND moego_code_labels <> ''`,
    [TENANT],
  );

  // Count usage so the seed can sort the common ones to the top — a list
  // of 93 alphabetically puts "#3" above "DOG AGGRESSIVE".
  const used = new Map<string, { label: string; n: number }>();
  for (const row of petRows as { v: string }[]) {
    for (const code of parsePetCodes(row.v)) {
      const key = code.toLowerCase();
      used.set(key, { label: used.get(key)?.label ?? code, n: (used.get(key)?.n ?? 0) + 1 });
    }
  }
  // Meanings may name codes nobody currently carries; include them too.
  for (const code of Object.keys(PET_CODE_MEANINGS)) {
    const key = code.toLowerCase();
    if (!used.has(key)) used.set(key, { label: code, n: 0 });
  }

  const [existingRows] = await c.query(`SELECT code FROM pet_codes WHERE tenant_id = ?`, [TENANT]);
  const existing = new Set((existingRows as { code: string }[]).map((r) => r.code.trim().toLowerCase()));

  const toInsert = [...used.values()]
    .filter((u) => !existing.has(u.label.trim().toLowerCase()))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  console.log(`codes in use: ${[...used.values()].filter((u) => u.n > 0).length}`);
  console.log(`already in the catalogue: ${existing.size}`);
  console.log(`to insert: ${toInsert.length}\n`);
  for (const u of toInsert.slice(0, 15)) {
    const meaning = PET_CODE_MEANINGS[u.label] ?? null;
    console.log(`  ${String(u.n).padStart(4)} dogs  ${u.label.padEnd(22)} ${meaning ?? "(no description)"}`);
  }
  if (toInsert.length > 15) console.log(`  ... and ${toInsert.length - 15} more`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    let order = 0;
    for (const u of toInsert) {
      await c.query(
        `INSERT INTO pet_codes (tenant_id, code, description, sort_order, is_active)
         VALUES (?, ?, ?, ?, TRUE)`,
        [TENANT, u.label, PET_CODE_MEANINGS[u.label] ?? null, order++],
      );
    }
    await c.commit();
    console.log(`\ninserted ${toInsert.length} codes`);
  } catch (e) {
    await c.rollback();
    console.error("ROLLED BACK —", (e as Error).message);
    process.exitCode = 1;
  }
  await c.end();
}

main();

/**
 * Fill in the size band for dogs that still have none.
 *
 *   corepack pnpm exec tsx scripts/backfill-size-bands.ts           # dry run
 *   corepack pnpm exec tsx scripts/backfill-size-bands.ts --apply   # write
 *
 * Two passes, best evidence first:
 *
 *   1. From a weight already on the record. Exact — the dog was weighed,
 *      the band just predates the column.
 *   2. From the breed, for breeds that sit clearly inside one band. A last
 *      resort, recorded as "breed" so it is never mistaken for a weight and
 *      is replaced the moment anyone weighs the dog.
 *
 * What it will not do is guess. The salon's bands are narrow and most breed
 * ranges straddle two or three, so anything unclear is listed by name for
 * somebody who knows the dog. A dog filed one band too small is quoted and
 * timed short, and its groomer's target is set too high.
 *
 * Never touches a band already set, whatever its source.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { bandForWeight } from "../shared/dogSizeBand.ts";
import { bandFromBreed } from "../shared/breedSize.ts";

dotenv.config({ quiet: true });
const APPLY = process.argv.includes("--apply");

const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

/** Only dogs the salon has actually seen lately are worth chasing. */
const [rows] = (await db.query(`
  SELECT p.id, p.name, p.breed, p.weight_kg, c.first_name, c.last_name,
         COUNT(a.id) AS visits
  FROM pets p
  JOIN clients c ON c.id = p.client_id
  JOIN appointments a ON a.pet_id = p.id
  WHERE p.tenant_id = 1 AND p.size_band IS NULL
    AND a.scheduled_start >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
  GROUP BY p.id, p.name, p.breed, p.weight_kg, c.first_name, c.last_name
  ORDER BY visits DESC
`)) as any;

type Plan = { id: number; band: string; source: "weighed" | "breed"; label: string };
const planned: Plan[] = [];
const unresolved: Array<{ label: string; breed: string; visits: number }> = [];

for (const row of rows) {
  const label = `${row.name} (${row.first_name} ${row.last_name})`;
  const fromWeight = bandForWeight(row.weight_kg);
  if (fromWeight) {
    planned.push({ id: row.id, band: fromWeight, source: "weighed", label });
    continue;
  }
  const fromBreed = bandFromBreed(row.breed);
  if (fromBreed) {
    planned.push({ id: row.id, band: fromBreed, source: "breed", label });
    continue;
  }
  unresolved.push({ label, breed: row.breed ?? "(no breed recorded)", visits: Number(row.visits) });
}

const byWeight = planned.filter((p) => p.source === "weighed");
const byBreed = planned.filter((p) => p.source === "breed");

console.log(`\nActive dogs with no size band: ${rows.length}`);
console.log(`  from a weight already recorded: ${byWeight.length}  (exact)`);
console.log(`  from an unambiguous breed:      ${byBreed.length}  (approximate)`);
console.log(`  still need a human:             ${unresolved.length}`);

if (byWeight.length) {
  console.log(`\nFrom weight:`);
  for (const p of byWeight) console.log(`  ${p.band.padEnd(13)} ${p.label}`);
}
if (byBreed.length) {
  console.log(`\nFrom breed:`);
  for (const p of byBreed) console.log(`  ${p.band.padEnd(13)} ${p.label}`);
}
if (unresolved.length) {
  console.log(`\nLeft for somebody who knows the dog, most-seen first:`);
  for (const u of unresolved) {
    console.log(`  ${String(u.visits).padStart(3)} visits  ${u.label.padEnd(34)} ${u.breed}`);
  }
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to set ${planned.length} bands.`);
  await db.end();
  process.exit(0);
}

await db.beginTransaction();
try {
  let written = 0;
  for (const p of planned) {
    const [res] = (await db.execute(
      `UPDATE pets SET size_band = ?, size_band_source = ?
       WHERE id = ? AND tenant_id = 1 AND size_band IS NULL`,
      [p.band, p.source, p.id],
    )) as any;
    if (res.affectedRows !== 1) throw new Error(`${p.label}: expected 1 row, touched ${res.affectedRows}`);
    written++;
  }
  if (written !== planned.length) throw new Error(`wrote ${written}, expected ${planned.length}`);
  await db.commit();
  console.log(`\nWROTE ${written} size bands.`);
} catch (error) {
  await db.rollback();
  console.error("\nROLLED BACK:", (error as Error).message);
  process.exitCode = 1;
}
await db.end();

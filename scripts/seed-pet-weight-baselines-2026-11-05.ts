/**
 * Give every dog that already has a weight one baseline row in its history.
 *
 *   corepack pnpm exec tsx scripts/seed-pet-weight-baselines-2026-11-05.ts           # dry run
 *   corepack pnpm exec tsx scripts/seed-pet-weight-baselines-2026-11-05.ts --apply   # write
 *
 * Run AFTER migration 0154 creates `pet_weights`, and BEFORE the weight
 * tracking code reaches `main`.
 *
 * ── Why this has to run, and run first ─────────────────────────────────────
 *
 * `pets.weight_kg` holds one figure and `pets.updateWeight` overwrites it.
 * Weight history starts empty, so the FIRST time anybody edits a dog's
 * weight after the deploy, the only record of what it weighed before is
 * gone — the new value goes into history, the old one is overwritten, and
 * nothing anywhere remembers it. 2,177 dogs have a weight today. Each one
 * would read "first recorded weight" with no trend until its SECOND
 * weighing, months later.
 *
 * Seeding first makes the next weighing useful instead of the one after it.
 * That is also why the order matters: a dog weighed between the deploy and
 * this script keeps its new reading and has already lost its old one, and
 * the guard below correctly refuses to invent a baseline for it.
 *
 * ── The honest caveat, which is written into every row ─────────────────────
 *
 * `pets` records no weighing date, so `recorded_at` has to come from
 * `pets.updated_at` — the last time the pet record changed. Measured on the
 * real book, that is a good proxy and not a guess: 2,087 of the 2,177
 * (96%) fall on 7, 8 and 14 October 2026, the three MoeGo "Pet list"
 * import runs that brought the weights in, and nothing has touched those
 * rows since. The remaining ~90 are single days spread through October and
 * November, which is staff recording a weight by hand.
 *
 * But it is the date Groomigo RECEIVED the figure, not the date a dog stood
 * on the scales — MoeGo had most of these on file long before the import.
 * So the note on every row says exactly that, rather than letting a later
 * reader mistake it for a weighing.
 *
 * ── The guards ─────────────────────────────────────────────────────────────
 *
 *  - Dry run by default. --apply is the only way to write.
 *  - Refuses to run at all if `pet_weights` does not exist yet, rather than
 *    failing half way with a confusing error.
 *  - Skips any dog that ALREADY has a history row, so a re-run is a no-op
 *    and a dog weighed since the deploy is left alone (see above).
 *  - One transaction, asserting the inserted row count is exactly the
 *    planned count, and rolling back whole if it is not.
 *  - The plan and the write share one WHERE clause, so what is counted is
 *    what is inserted.
 *  - `updated_at` is copied inside the database by INSERT ... SELECT and
 *    never passes through this process, so no driver timezone conversion
 *    can shift it.
 *  - Weights outside 0 < kg <= 80 are refused and listed. That is
 *    Groomigo's own bound in pets.updateWeight, and a backfill must not be
 *    a back door around it. (There are none today; min 1.00, max 67.00.)
 *  - `tenant_id` is copied from the dog, never assumed to be 1.
 *  - Fully reversible: every row carries the "Baseline:" note prefix, and
 *    the script prints the exact DELETE.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");

/** Groomigo's own bound, from pets.updateWeight. */
const MAX_KG = 80;

/**
 * Written to every seeded row. The "Baseline:" prefix is load-bearing — it
 * is how the rollback finds these rows and nothing else.
 */
const NOTE =
  "Baseline: the weight already on the dog's record when history began. " +
  "The date is when Groomigo received that figure, not when the dog was weighed.";

/**
 * The one condition, used by the count, the report and the insert. A dog
 * with a usable weight and no history yet.
 */
const WHERE = `
      p.weight_kg IS NOT NULL
  AND p.weight_kg > 0
  AND p.weight_kg <= ${MAX_KG}
  AND NOT EXISTS (
        SELECT 1 FROM pet_weights w
         WHERE w.pet_id = p.id AND w.tenant_id = p.tenant_id
      )`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [tables] = await c.query<any[]>('SHOW TABLES LIKE "pet_weights"');
  if (tables.length === 0) {
    console.error("`pet_weights` does not exist. Apply migration 0154 first:");
    console.error("  corepack pnpm exec drizzle-kit migrate");
    await c.end();
    process.exit(1);
  }

  // Everything that has a weight, split into the three buckets, so the
  // numbers below account for every one of them.
  const [[totals]] = await c.query<any[]>(`
    SELECT COUNT(*) withWeight,
           SUM(p.weight_kg <= 0 OR p.weight_kg > ${MAX_KG}) outOfBounds,
           SUM(EXISTS (SELECT 1 FROM pet_weights w
                        WHERE w.pet_id = p.id AND w.tenant_id = p.tenant_id)) alreadyHasHistory
      FROM pets p
     WHERE p.weight_kg IS NOT NULL`);

  const [[plan]] = await c.query<any[]>(`
    SELECT COUNT(*) n, COUNT(DISTINCT p.tenant_id) tenants,
           MIN(p.weight_kg) minKg, MAX(p.weight_kg) maxKg
      FROM pets p WHERE ${WHERE}`);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — baseline weight rows`);
  console.log("");
  console.log(`  dogs with a weight on file     ${totals.withWeight}`);
  console.log(`  already have a history row     ${totals.alreadyHasHistory}  (skipped — their history has begun)`);
  console.log(`  refused, outside 0-${MAX_KG} kg      ${totals.outOfBounds}`);
  console.log(`  TO SEED                        ${plan.n}  across ${plan.tenants} tenant(s), ${plan.minKg}-${plan.maxKg} kg`);
  console.log("");

  if (Number(totals.outOfBounds) > 0) {
    const [bad] = await c.query<any[]>(`
      SELECT p.id, p.name, p.weight_kg FROM pets p
       WHERE p.weight_kg IS NOT NULL AND (p.weight_kg <= 0 OR p.weight_kg > ${MAX_KG})`);
    console.log("Refused (outside Groomigo's own bound — fix the pet record, not this script):");
    console.table(bad);
  }

  if (Number(plan.n) === 0) {
    console.log("Nothing to do.");
    await c.end();
    return;
  }

  const [spread] = await c.query<any[]>(`
    SELECT DATE_FORMAT(p.updated_at, "%Y-%m-%d") day, COUNT(*) n
      FROM pets p WHERE ${WHERE}
     GROUP BY day ORDER BY n DESC LIMIT 6`);
  console.log("recorded_at will be pets.updated_at — the six biggest days:");
  console.table(spread);

  const [sample] = await c.query<any[]>(`
    SELECT p.id petId, p.tenant_id tenantId, p.name, p.weight_kg weightKg,
           DATE_FORMAT(p.updated_at, "%Y-%m-%d %H:%i") recordedAt
      FROM pets p WHERE ${WHERE}
     ORDER BY p.id LIMIT 8`);
  console.log("First eight rows as they will be written:");
  console.table(sample);
  console.log(`note on every row: ${JSON.stringify(NOTE)}`);
  console.log("");

  if (!APPLY) {
    console.log("Nothing written. To write:");
    console.log("  corepack pnpm exec tsx scripts/seed-pet-weight-baselines-2026-11-05.ts --apply");
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    // INSERT ... SELECT: updated_at is copied inside the database, so the
    // driver never parses or re-renders a timestamp. created_at is left to
    // its default — when the BASELINE was written, which is a different
    // fact from when the weight was recorded, and both are worth keeping.
    const [res] = await c.query<any>(
      `INSERT INTO pet_weights
         (tenant_id, pet_id, weight_kg, recorded_at, recorded_by_user_id, note)
       SELECT p.tenant_id, p.id, p.weight_kg, p.updated_at, NULL, ?
         FROM pets p WHERE ${WHERE}`,
      [NOTE],
    );
    if (Number(res.affectedRows) !== Number(plan.n)) {
      throw new Error(`Expected to insert ${plan.n} rows, inserted ${res.affectedRows} — rolling back`);
    }
    await c.commit();
    console.log(`Inserted ${res.affectedRows} baseline rows.`);
  } catch (err) {
    await c.rollback();
    console.error("Rolled back. Nothing written.");
    throw err;
  }

  // Read it back rather than trusting the write.
  const [[after]] = await c.query<any[]>(
    'SELECT COUNT(*) n, COUNT(DISTINCT pet_id) dogs FROM pet_weights WHERE note LIKE "Baseline:%"',
  );
  const [[left]] = await c.query<any[]>(`SELECT COUNT(*) n FROM pets p WHERE ${WHERE}`);
  console.log(`  pet_weights baseline rows now   ${after.n} across ${after.dogs} dogs`);
  console.log(`  dogs still without history      ${left.n}  (should be 0)`);
  console.log("");
  console.log("To undo:");
  console.log('  DELETE FROM pet_weights WHERE note LIKE "Baseline:%";');
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Put `pets.weight` back in step with `pets.weight_kg` on the four dogs
 * where they disagree.
 *
 *   corepack pnpm exec tsx scripts/fix-weight-column-pair-2026-11-05.ts           # dry run
 *   corepack pnpm exec tsx scripts/fix-weight-column-pair-2026-11-05.ts --apply   # write
 *
 * ── What is actually wrong, stated accurately ──────────────────────────────
 *
 * `weight` and `weight_kg` are near-duplicates inherited from the migration,
 * and shared/petWeight.ts owns the rule that they are written together,
 * always. Four dogs break it: weight_kg set, weight NULL.
 *
 * It has NO visible symptom today, and I said otherwise before checking.
 * Every single reader of `weight` in the codebase reads `weight_kg` first
 * and falls back:
 *
 *   memberships.getPackageOptions   pet.weightKg ?? pet.weight
 *   memberships.create              pet.weightKg ?? pet.weight
 *   resolveTimingReviewThreshold    input.weightKg ?? input.weight
 *   ClientPetsAside.tsx             pet.weightKg ?? pet.weight
 *
 * So no screen shows these dogs as unweighed, no membership is mispriced
 * and no timing threshold is wrong. This is closing a latent trap, not
 * fixing a live fault: the next reader that forgets the `??` sees four
 * dogs with no weight, and the invariant petWeightUpdate maintains should
 * hold for every row rather than most of them.
 *
 * ── Where they came from, and why the app cannot make more ─────────────────
 *
 * A one-off import script: moego-new-clients-2026-10-12.ts line 101 is
 * `INSERT INTO pets (tenant_id, client_id, name, species, breed, weight_kg)`
 * — raw SQL, so it bypasses petWeightUpdate and never set the pair.
 *
 * All three live insert paths are correct and were checked:
 *   routers.ts pets.create          via petWeightUpdate, sets both
 *   membershipSignup.ts             sets both explicitly
 *   waitlist.ts                     sets neither (no weight collected)
 *
 * So this is a one-time repair with nothing to re-break it. The dated
 * import scripts are left as they are — they record what was run.
 *
 * ── The guards ─────────────────────────────────────────────────────────────
 *
 *  - Dry run by default. --apply is the only way to write.
 *  - Copies weight_kg to weight, never the reverse: weight_kg is the column
 *    every reader prefers and the one the new weight history stores.
 *  - Only ever touches rows where weight IS NULL, so a row where the two
 *    differ for some reason nobody has thought of is reported, not
 *    overwritten.
 *  - One transaction, asserting the updated count equals the planned count.
 *  - Reversible: the script prints the exact UPDATE to put the NULLs back.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");

/** weight_kg present, weight missing. Nothing else. */
const WHERE = "p.weight_kg IS NOT NULL AND p.weight IS NULL";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [plan] = await c.query<any[]>(
    `SELECT p.id, p.tenant_id tenantId, p.name, p.weight_kg weightKg, p.weight,
            p.size_band sizeBand, p.status
       FROM pets p WHERE ${WHERE} ORDER BY p.id`,
  );

  // The other direction, which this script deliberately does NOT touch.
  const [[other]] = await c.query<any[]>(
    "SELECT SUM(weight IS NOT NULL AND weight_kg IS NULL) wOnly, SUM(weight_kg <> weight) differ FROM pets",
  );

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — realign pets.weight with pets.weight_kg`);
  console.log("");
  console.log(`  TO FIX (weight_kg set, weight NULL)   ${plan.length}`);
  console.log(`  weight set with no weight_kg          ${other.wOnly}  (not touched — would need a decision)`);
  console.log(`  both set but disagreeing              ${other.differ}  (not touched — same)`);
  console.log("");

  if (plan.length === 0) {
    console.log("Nothing to do.");
    await c.end();
    return;
  }
  console.table(plan);

  if (!APPLY) {
    console.log("Nothing written. To write:");
    console.log("  corepack pnpm exec tsx scripts/fix-weight-column-pair-2026-11-05.ts --apply");
    await c.end();
    return;
  }

  const ids = plan.map((r) => r.id);
  await c.beginTransaction();
  try {
    const [res] = await c.query<any>(
      `UPDATE pets p SET p.weight = p.weight_kg WHERE ${WHERE} AND p.id IN (?)`,
      [ids],
    );
    if (Number(res.affectedRows) !== plan.length) {
      throw new Error(`Expected to update ${plan.length} rows, updated ${res.affectedRows} — rolling back`);
    }
    await c.commit();
    console.log(`Updated ${res.affectedRows} rows.`);
  } catch (err) {
    await c.rollback();
    console.error("Rolled back. Nothing written.");
    throw err;
  }

  const [after] = await c.query<any[]>(
    `SELECT id, name, weight_kg weightKg, weight FROM pets WHERE id IN (?) ORDER BY id`,
    [ids],
  );
  console.table(after);
  const [[left]] = await c.query<any[]>(`SELECT COUNT(*) n FROM pets p WHERE ${WHERE}`);
  console.log(`  rows still mismatched   ${left.n}  (should be 0)`);
  console.log("");
  console.log("To undo:");
  console.log(`  UPDATE pets SET weight = NULL WHERE id IN (${ids.join(", ")});`);
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Silver+ catalogue changes, 18/10/2026. Andy's call, in his words:
 * "Silver+ is for 2 dogs. It is exactly 2 x normal silver so $58 is for
 * both dogs. $29 x 2" — and then "create the $29 single dog plan and
 * widen x2 to 13kg".
 *
 * Two things:
 *
 * 1. A single-dog Silver+ at $29, five-weekly, for the Small and
 *    Small-Medium bands. One row per band, matching how the 48 seeded
 *    plans are laid out.
 *
 * 2. Silver+ (x2) loses its weight band.
 *
 * That second one needs saying plainly. "Widen to 13kg" cannot be
 * expressed in the column — weight_band holds ONE band, and 0-13kg is
 * two of them (small, small_medium). For a single-dog plan that is fine:
 * each dog resolves its own band and picks the matching row.
 *
 * A multi-dog plan cannot work that way. Sign-up requires every dog on
 * one plan id, so Julie's pair — Rosie at 9kg (small) and Teddy at
 * 10.5kg — would land on two different rows and be refused. A null band
 * is the only way one row serves a mixed-size pair, and the code already
 * treats null as "suits any dog, which is the point of a bespoke one".
 *
 * The cost is that it is offered to ANY weight, not just up to 13kg. A
 * hard cap would need min/max kg on a plan, which the schema has no room
 * for today. Flagged to Andy rather than quietly accepted.
 *
 * Run: node scripts/silver-plus-plans-2026-10-18.cjs [--apply]
 */
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const X2_PLAN_ID = 60001;

const SINGLES = ["small", "small_medium"].map((band) => ({
  band,
  code: `silver-plus-${band}`,
  name: "Silver+",
  price: "29.00",
}));

(async () => {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [before] = await conn.query(
    "SELECT id, name, code, weight_band, weekly_price_aud, covers_pets FROM membership_plans WHERE tenant_id = ? AND appointment_interval_weeks = 5 AND is_active = 1 ORDER BY id",
    [TENANT],
  );
  console.log("five-weekly plans BEFORE:");
  console.table(before);

  for (const plan of SINGLES) {
    const [[existing]] = await conn.query(
      "SELECT id FROM membership_plans WHERE tenant_id = ? AND code = ?",
      [TENANT, plan.code],
    );
    if (existing) {
      console.log(`skip ${plan.code} — already exists as id ${existing.id}`);
      continue;
    }
    if (!APPLY) {
      console.log(`would create ${plan.code}: ${plan.name} $${plan.price} ${plan.band} 5-weekly, 1 dog`);
      continue;
    }
    const [res] = await conn.query(
      `INSERT INTO membership_plans
         (tenant_id, name, code, tier, service_variant, weight_band,
          weekly_price_aud, billing_cycle_weeks, appointment_interval_weeks,
          covers_pets, is_active, sort_order)
       VALUES (?, ?, ?, 'silver', 'styled', ?, ?, 1, 5, 1, 1, 1)`,
      [TENANT, plan.name, plan.code, plan.band, plan.price],
    );
    console.log(`created ${plan.code} as id ${res.insertId}`);
  }

  // Guarded on covers_pets = 2 so a mistyped id cannot blank the band on
  // an ordinary single-dog plan.
  if (!APPLY) {
    console.log(`would clear the weight band on plan ${X2_PLAN_ID} (the x2)`);
  } else {
    const [res] = await conn.query(
      "UPDATE membership_plans SET weight_band = NULL WHERE id = ? AND tenant_id = ? AND covers_pets = 2",
      [X2_PLAN_ID, TENANT],
    );
    console.log(`x2 band cleared, rows changed: ${res.affectedRows}`);
  }

  const [after] = await conn.query(
    "SELECT id, name, code, weight_band, weekly_price_aud, covers_pets FROM membership_plans WHERE tenant_id = ? AND appointment_interval_weeks = 5 AND is_active = 1 ORDER BY id",
    [TENANT],
  );
  console.log(APPLY ? "five-weekly plans AFTER:" : "five-weekly plans (unchanged — dry run):");
  console.table(after);

  await conn.end();
})();

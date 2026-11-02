/**
 * Harry's warning says the wrong thing about the wrong record.
 *
 * Written earlier today as part of "Fix Harry and Simba's dog names":
 *
 *     2 GROOMER DOG. Owner Tara Mico is marked this way in MoeGo;
 *     moved here 02/11/2026 so the board can show it. Check with
 *     Lauren before booking.
 *
 * Two things wrong with it. The owner was never marked — "2 GROOMER
 * DOG" was appended to the DOG's name, and Tara Mico's record is clean.
 * And "check with Lauren before booking" is the wording for a dog whose
 * status is in question; Harry's is not. He is a two-groomer dog, that
 * is all, and sending staff to ask about every booking is friction on
 * the floor for a fact already on the card.
 *
 * MoeGo now holds the instruction as a pet note, so the provenance
 * line can say where it actually lives.
 *
 *   corepack pnpm exec tsx scripts/fix-harry-warning-wording-2026-11-02.ts
 *   corepack pnpm exec tsx scripts/fix-harry-warning-wording-2026-11-02.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const PET = 5754;
const WARNING =
  "2 GROOMER DOG — needs two people on the groom. Carried in this dog's MoeGo " +
  "name until 02/11/2026; now a MoeGo pet note as well, and here so the board " +
  "shows it at booking time.";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  const [[pet]]: any = await c.query(
    `SELECT name, alert_level alertLevel, warnings FROM pets WHERE id=? AND tenant_id=?`, [PET, TENANT]);
  if (!pet) throw new Error("pet not found");
  if (pet.name !== "Harry") throw new Error(`pet ${PET} is "${pet.name}", not Harry`);

  console.log(`Harry (${PET}), alert stays ${pet.alertLevel}`);
  console.log(`   was: ${pet.warnings}`);
  console.log(`   now: ${WARNING}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written."); await c.end(); return; }

  const [r]: any = await c.query(
    `UPDATE pets SET warnings=? WHERE id=? AND tenant_id=? AND name='Harry'`, [WARNING, PET, TENANT]);
  if (r.affectedRows !== 1) throw new Error(`affected ${r.affectedRows} rows`);
  console.log("\ncommitted — wording corrected, alert_level untouched");
  await c.end();
})();

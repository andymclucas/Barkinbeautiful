/**
 * Put a price on upcoming rows that have none. Andy approved 29/10/2026.
 *
 * Only the ones arithmetic settles: a booking whose total is $0 because
 * a membership covers it, or a booking with one dog on it, where
 * MoeGo's total IS that dog's price. Everything else was left out.
 *
 * Toni Constantini is excluded by hand. She is on hold — no billing
 * until Andy confirms — and setting a price is billing.
 *
 *   tsx scripts/moego-price-nulls-apply.ts            # prints
 *   tsx scripts/moego-price-nulls-apply.ts --apply    # writes
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const APPLY = process.argv.includes("--apply");
const rows = JSON.parse(fs.readFileSync(S + "/nulls-to-write.json", "utf8"));

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY ===");
  await c.beginTransaction();
  let n = 0;
  try {
    for (const r of rows) {
      if (/constantini/i.test(r.who)) throw new Error(`${r.who} is on hold — refusing`);
      if (APPLY) {
        /* price IS NULL in the WHERE: if anything has priced this row
           since the dry run, the update must not fire. */
        const [res] = await c.query<any>(
          `UPDATE appointments SET price = ? WHERE id = ? AND price IS NULL`, [r.price, r.id]);
        if (res.affectedRows !== 1) throw new Error(`appt ${r.id} (${r.dog}) affected ${res.affectedRows} rows — aborting`);
      }
      n++;
      console.log(`  ${r.t}  ${String(r.who).padEnd(20)} ${String(r.dog).padEnd(14)} $${String(r.price).padStart(7)}   ${r.why}`);
    }
    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${n} priced, $${rows.reduce((a: number, r: any) => a + Number(r.price), 0).toFixed(2)}`); }
    else { await c.rollback(); console.log(`\nrolled back (dry): would price ${n}`); }
  } catch (e: any) {
    await c.rollback();
    console.log(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

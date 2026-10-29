/**
 * Reduce a dog carrying the WHOLE booking total to its own share.
 *
 * The original MoeGo import put the entire booking total on one dog of a
 * multi-dog booking. While the other dogs were missing from the board
 * that was merely odd; once they were added on 29/10/2026 with correct
 * per-dog prices, those bookings started summing to far more than MoeGo
 * charges — Rachel Schofield went to $825 against a $495 booking.
 *
 * The fix is arithmetic and checkable: the inflated dog's price is the
 * booking total less every other dog on it. It is applied ONLY when
 * every other dog is priced and Groomigo holds exactly as many dogs as
 * MoeGo does, so the result must reconcile.
 *
 *   tsx scripts/moego-fix-inflated-siblings.ts            # prints
 *   tsx scripts/moego-fix-inflated-siblings.ts --apply    # writes
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const APPLY = process.argv.includes("--apply");
const moego = Object.fromEntries(fs.readFileSync(S + "/moego/totals-2026-10-29.txt", "utf8").trim().split("\n")
  .map((l) => { const [id, t, n] = l.split("|"); return [id, { total: Number(t), pets: Number(n) }]; }));
const { inflated } = JSON.parse(fs.readFileSync(S + "/price-problems.json", "utf8"));
const targets = inflated.filter((r: any) => r.iAddedASibling);

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY ===");
  console.log(`candidates (bookings I added a dog to today): ${targets.length}\n`);
  await c.beginTransaction();
  let fixed = 0; const skipped: string[] = [];
  try {
    for (const t of targets) {
      const mo = moego[t.bid];
      const [list] = await c.query<any[]>(
        `SELECT a.id, p.name dog, a.price FROM appointments a JOIN pets p ON p.id=a.pet_id
          WHERE a.moego_appointment_id=? AND a.workflow_state NOT IN ("cancelled","no_show")`, [t.bid]);

      if (!mo) { skipped.push(`${t.dog}: booking not in the MoeGo pull`); continue; }
      if (list.length !== mo.pets) { skipped.push(`${t.dog}: Groomigo has ${list.length} dogs, MoeGo has ${mo.pets} — cannot reconcile`); continue; }
      const others = list.filter((r) => r.id !== t.id);
      if (others.some((r) => r.price === null)) { skipped.push(`${t.dog}: a sibling has no price`); continue; }
      const othersSum = others.reduce((n, r) => n + Number(r.price), 0);
      const share = Number((mo.total - othersSum).toFixed(2));
      if (share <= 0) { skipped.push(`${t.dog}: share would be $${share} — refusing`); continue; }

      if (APPLY) {
        /* Guard on the OLD price too: if anything changed it since the
           read, the update must not fire. */
        const [res] = await c.query<any>(
          `UPDATE appointments SET price=? WHERE id=? AND price=?`, [share.toFixed(2), t.id, Number(t.price).toFixed(2)]);
        if (res.affectedRows !== 1) throw new Error(`${t.dog} (appt ${t.id}) affected ${res.affectedRows} rows — aborting`);
      }
      fixed++;
      console.log(`  ${t.d} ${String(t.first_name + " " + t.last_name).padEnd(20)} ${String(t.dog).padEnd(9)} $${String(t.price).padStart(7)} -> $${share.toFixed(2).padStart(7)}   booking now ${others.map((o) => `${o.dog} $${o.price}`).join(" + ")} + ${t.dog} $${share.toFixed(2)} = $${mo.total}`);
    }
    if (skipped.length) { console.log("\nSKIPPED:"); skipped.forEach((s) => console.log("  " + s)); }
    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${fixed} prices corrected`); }
    else { await c.rollback(); console.log(`\nrolled back (dry): would correct ${fixed}`); }
  } catch (e: any) {
    await c.rollback();
    console.log(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

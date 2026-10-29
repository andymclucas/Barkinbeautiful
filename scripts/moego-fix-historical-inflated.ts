/**
 * The 48 past bookings where one dog carries the whole MoeGo total and
 * the others have none. All of them fall between 29/09 and 29/10/2026.
 *
 * Nothing here is a billing correction: Groomigo has issued two real
 * invoices in its life, both in October, and neither on these. The
 * money moved in MoeGo. What this fixes is REPORTING — revenue and
 * per-groomer figures read appointments.price, so a whole booking
 * sitting on one dog skews every number drawn from it.
 *
 * Deliberately conservative, because these are historical and the
 * prices of a month ago cannot be checked against anything else:
 *   - a $0 booking means a membership covered it; every dog is $0
 *   - every dog on one service means the total divides
 *   - anything else is left alone
 *
 *   tsx scripts/moego-fix-historical-inflated.ts            # prints
 *   tsx scripts/moego-fix-historical-inflated.ts --apply    # writes
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const APPLY = process.argv.includes("--apply");
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const BOOKINGS = fs.readFileSync(S + "/moego/hist-48.txt", "utf8").trim().split("\n").map((l) => {
  const [bid, date, pets, svcs, total] = l.split("~");
  return { bid, date, pets: pets.split(",").map((s) => s.trim()), svcs: svcs.split(",").map((s) => s.trim()), total: Number(total) };
});

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY ===\n");
  await c.beginTransaction();
  let written = 0, bookingsTouched = 0; const skipped: string[] = [];
  try {
    for (const b of BOOKINGS) {
      const [live] = await c.query<any[]>(
        `SELECT a.id, p.name dog, a.price, cl.first_name, cl.last_name
           FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients cl ON cl.id=a.client_id
          WHERE a.moego_appointment_id=? AND a.workflow_state NOT IN ("cancelled","no_show")`, [b.bid]);
      const who = live.length ? `${live[0].first_name} ${live[0].last_name}`.trim() : "?";

      if (live.length !== b.pets.length) { skipped.push(`${b.date} ${who}: Groomigo has ${live.length} dogs, MoeGo ${b.pets.length}`); continue; }

      let each: number;
      let how: string;
      if (b.total === 0) { each = 0; how = "$0 booking — a membership covered it"; }
      else if (b.svcs.length === b.pets.length && b.svcs.every((s) => s === b.svcs[0])) {
        each = Number((b.total / b.pets.length).toFixed(2));
        how = `one service for all ${b.pets.length} — $${b.total} ÷ ${b.pets.length}`;
      } else {
        skipped.push(`${b.date} ${who}: ${b.pets.length} dogs, ${b.svcs.length} service entries${b.svcs.length === b.pets.length ? " but they differ" : " (add-on)"} — $${b.total} not divisible`);
        continue;
      }

      const changes = live.filter((r) => (r.price === null ? null : Number(r.price).toFixed(2)) !== each.toFixed(2));
      if (!changes.length) continue;
      bookingsTouched++;
      console.log(`${b.date} ${who} — ${how}`);
      for (const row of live) {
        const now = row.price === null ? null : Number(row.price).toFixed(2);
        if (now === each.toFixed(2)) { continue; }
        if (APPLY) {
          const [res] = await c.query<any>(
            now === null
              ? `UPDATE appointments SET price=? WHERE id=? AND price IS NULL`
              : `UPDATE appointments SET price=? WHERE id=? AND price=?`,
            now === null ? [each.toFixed(2), row.id] : [each.toFixed(2), row.id, now]);
          if (res.affectedRows !== 1) throw new Error(`${row.dog} (appt ${row.id}) affected ${res.affectedRows} rows — aborting`);
        }
        written++;
        console.log(`   ${String(row.dog).padEnd(14)} ${now === null ? "(none)" : "$" + now} -> $${each.toFixed(2)}`);
      }
    }
    console.log(`\nLEFT ALONE: ${skipped.length}`);
    skipped.forEach((s) => console.log("  " + s));
    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${written} rows across ${bookingsTouched} bookings`); }
    else { await c.rollback(); console.log(`\nrolled back (dry): would set ${written} rows across ${bookingsTouched} bookings`); }
  } catch (e: any) {
    await c.rollback();
    console.log(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

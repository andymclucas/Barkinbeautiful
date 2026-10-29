/**
 * The 7 bookings where one dog carries the whole MoeGo total and the
 * others have no price — none of them created by today's sync.
 *
 * Every booking must reconcile EXACTLY to MoeGo's total before a single
 * row is written. Where the dogs share one service the total divides;
 * where they differ, known per-dog prices cover all but one dog and the
 * last is the residual, which only holds if the sum lands on the total.
 *
 *   tsx scripts/moego-fix-inflated-round2.ts            # prints
 *   tsx scripts/moego-fix-inflated-round2.ts --apply    # writes
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** MoeGo, pulled 29/10/2026: booking ~ date ~ pets ~ services ~ total. */
const MOEGO = [
  "101180506~Rosie, Teddy~Diamond - Gold (up to 6wks) -SML-10kg-Style Full Groom, Diamond - Gold (up to 6wks) -SML-10kg-Style Full Groom~290",
  "129460451~Luna, Ellie~Tidy - Medium size or long hair, Tidy - Small size or short hair~198",
  "102009583~Leo, Leila~Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic, Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic~180",
  "97688928~Tammy, Oliver~Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic, Nail painting, Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic~250",
  "109597478~Olah, Teddy, Eevee, Georgi~Tidy - Medium size or long hair, Tidy - Medium size or long hair, Tidy - Medium size or long hair, Tidy - Large size or long hair~550",
  "132615333~Banjo~Bronze (8wks) - SMALL-10kg Style Full Groom - Longer clip/ Trad~163",
].map((l) => {
  const [bid, pets, svcs, total] = l.split("~");
  return { bid, pets: pets.split(",").map((s) => s.trim()), svcs: svcs.split(",").map((s) => s.trim()), total: Number(total) };
});

/** Every observation of these in MoeGo's single-dog bookings agreed. */
const FIRM: Record<string, number> = {
  "Tidy - Medium size or long hair": 110,
  "Tidy - Small size or short hair": 88,
};

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY ===\n");
  await c.beginTransaction();
  let written = 0; const skipped: string[] = [];
  try {
    for (const b of MOEGO) {
      const [live] = await c.query<any[]>(
        `SELECT a.id, p.name dog, a.price, cl.first_name, cl.last_name
           FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients cl ON cl.id=a.client_id
          WHERE a.moego_appointment_id=? AND a.workflow_state NOT IN ("cancelled","no_show")`, [b.bid]);
      const who = live.length ? `${live[0].first_name} ${live[0].last_name}`.trim() : "?";

      if (live.length !== b.pets.length) {
        skipped.push(`${who} (${b.bid}): Groomigo has ${live.length} dogs [${live.map((r) => r.dog).join(", ")}], MoeGo has ${b.pets.length} [${b.pets.join(", ")}] — not a pricing problem`);
        continue;
      }
      if (b.svcs.length !== b.pets.length) {
        skipped.push(`${who} (${b.bid}): ${b.pets.length} dogs but ${b.svcs.length} service entries — an add-on makes the position meaningless (Trap 3)`);
        continue;
      }

      // Work out each dog's price.
      const same = b.svcs.every((s) => s === b.svcs[0]);
      let prices: (number | null)[];
      let how: string;
      if (same) {
        prices = b.pets.map(() => Number((b.total / b.pets.length).toFixed(2)));
        how = `one service for all ${b.pets.length} — $${b.total} ÷ ${b.pets.length}`;
      } else {
        prices = b.svcs.map((s) => (FIRM[s] !== undefined ? FIRM[s] : null));
        const unknown = prices.filter((p) => p === null).length;
        if (unknown > 1) { skipped.push(`${who} (${b.bid}): ${unknown} services with no firm price — cannot solve`); continue; }
        if (unknown === 0) {
          /* Every dog's price known independently. The reconciliation
             below then CHECKS the answer rather than producing it,
             which is the strongest case there is — not a rejection. */
          how = `every dog priced independently, and they sum to the total`;
        } else {
          const known = prices.filter((p): p is number => p !== null).reduce((a, x) => a + x, 0);
          prices = prices.map((p) => (p === null ? Number((b.total - known).toFixed(2)) : p));
          how = `known prices for ${b.pets.length - 1} dogs, the last is the residual`;
        }
      }
      const sum = prices.reduce((a, x) => a + Number(x), 0);
      if (Math.abs(sum - b.total) > 0.01) { skipped.push(`${who} (${b.bid}): ${prices.join(" + ")} = ${sum}, not $${b.total} — refusing`); continue; }

      console.log(`${who} — MoeGo $${b.total} (${how})`);
      for (let i = 0; i < b.pets.length; i++) {
        const row = live.find((r) => norm(r.dog) === norm(b.pets[i]));
        if (!row) { throw new Error(`${who}: no Groomigo row for ${b.pets[i]} — aborting`); }
        const want = Number(prices[i]).toFixed(2);
        const now = row.price === null ? null : Number(row.price).toFixed(2);
        if (now === want) { console.log(`   ${String(row.dog).padEnd(9)} $${want}  (already)`); continue; }
        if (APPLY) {
          const [res] = await c.query<any>(
            now === null
              ? `UPDATE appointments SET price=? WHERE id=? AND price IS NULL`
              : `UPDATE appointments SET price=? WHERE id=? AND price=?`,
            now === null ? [want, row.id] : [want, row.id, now]);
          if (res.affectedRows !== 1) throw new Error(`${row.dog} (appt ${row.id}) affected ${res.affectedRows} rows — aborting`);
        }
        written++;
        console.log(`   ${String(row.dog).padEnd(9)} ${now === null ? "(none)" : "$" + now} -> $${want}`);
      }
      console.log("");
    }
    if (skipped.length) { console.log("LEFT ALONE:"); skipped.forEach((s) => console.log("  " + s)); }
    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${written} prices set`); }
    else { await c.rollback(); console.log(`\nrolled back (dry): would set ${written}`); }
  } catch (e: any) {
    await c.rollback();
    console.log(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

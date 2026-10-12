/**
 * Fill in prices MoeGo knows and Groomigo does not.
 *
 *   node scripts/moego-backfill-prices-2026-10-12.ts "<sales.xlsx>"
 *   node scripts/moego-backfill-prices-2026-10-12.ts "<sales.xlsx>" --apply
 *
 * Source is MoeGo's "Sales and appointments report", which carries what was
 * actually COLLECTED per booking — not a list price from the catalogue. That
 * distinction matters: appointments.price is documented as the collected
 * figure, and inventing one from the price list would put numbers in the
 * revenue reports that nobody was ever charged.
 *
 * Only ever writes where price IS NULL **and no sibling dog on the same day
 * already carries a price**. That second condition is the important one: this
 * salon records a multi-dog booking's whole fee on the FIRST dog's row and
 * leaves the siblings NULL deliberately — the sync skill says so in as many
 * words, "copying it inflates revenue". 80 of the 102 unpriced appointments
 * are those siblings, and filling them would have double-counted roughly
 * $6,600. Only the 22 with no priced sibling are genuinely missing.
 *
 * It never corrects an existing figure either, because a price somebody typed
 * is better evidence than a report.
 *
 * Three things it refuses to guess, all held back rather than approximated:
 *   · a multi-dog booking whose dogs had DIFFERENT services — the booking
 *     total cannot be apportioned without knowing each service's price;
 *   · a pet name that appears twice on the same day, where pet+date cannot
 *     identify which booking is which;
 *   · a booking MoeGo records as $0.
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";
dotenv.config({ quiet: true });

const FILE = process.argv.find((a) => a.endsWith(".xlsx"));
const APPLY = process.argv.includes("--apply");
if (!FILE) { console.error("need the sales xlsx path"); process.exit(1); }

const unzip = (entry: string, optional = false) => {
  try { return execFileSync("unzip", ["-p", FILE, entry], { maxBuffer: 4e8, stdio: ["ignore","pipe","ignore"] }).toString("utf8"); }
  catch (e) { if (optional) return ""; throw e; }
};
const rows = parseSheet(unzip("xl/worksheets/sheet1.xml"), parseSharedStrings(unzip("xl/sharedStrings.xml", true)));
const head = rows[0].map((h: string) => String(h ?? "").trim());
const I = (n: string) => head.findIndex((c: string) => c.toLowerCase() === n.toLowerCase());
const money = (v: unknown) => Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0;
const norm = (s: string) => String(s ?? "").trim().toLowerCase();
const toIso = (d: string) => {
  const m = String(d ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : "";
};
/** "Rosie(Full Groom), Teddy(Full Groom)" → one entry per dog. */
function petServices(cell: string) {
  const out: { pet: string; service: string }[] = [];
  const re = /([^,(]+)\(([^)]*)\)/g; let m;
  while ((m = re.exec(String(cell ?? ""))) !== null) out.push({ pet: m[1].trim(), service: m[2].trim() });
  return out;
}

type Booking = { id: string; net: number; expected: number; iso: string; pets: string[]; sameService: boolean };
const bookings: Booking[] = [];
for (const r of rows.slice(1)) {
  const id = String(r[I("Booking ID")] ?? "").trim(); if (!id) continue;
  const ps = petServices(String(r[I("Pet & services")] ?? ""));
  bookings.push({
    id, net: money(r[I("Net sale")]), expected: money(r[I("Expected revenue")]),
    iso: toIso(String(r[I("Date")] ?? "")),
    pets: ps.map((p) => p.pet), sameService: new Set(ps.map((p) => p.service)).size <= 1,
  });
}
const byId = new Map(bookings.map((b) => [b.id, b]));
const byPetDate = new Map<string, Booking[]>();
for (const b of bookings) for (const p of b.pets) {
  const k = `${norm(p)}|${b.iso}`;
  if (!byPetDate.has(k)) byPetDate.set(k, []);
  byPetDate.get(k)!.push(b);
}

(async () => {
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } });
  const [unpriced] = (await db.query(`
    SELECT a.id, a.moego_appointment_id b, p.name pet, c.first_name, c.last_name,
           DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') dt
    FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients c ON c.id=a.client_id
    WHERE a.tenant_id=1 AND a.workflow_state='complete' AND a.price IS NULL
      AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.client_id=a.client_id
                     AND m.status='active' AND (m.is_test IS NULL OR m.is_test=0))
      -- The sibling guard. Without it this double-counts 80 rows.
      AND NOT EXISTS(
        SELECT 1 FROM appointments s
        WHERE s.client_id = a.client_id AND s.id <> a.id
          AND s.workflow_state = 'complete' AND s.price IS NOT NULL
          AND DATE(CONVERT_TZ(s.scheduled_start,'+00:00','+10:00'))
              = DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')))
    ORDER BY a.scheduled_start`)) as any;

  // Group by the booking each appointment resolves to, so a split can be
  // apportioned across the dogs we actually hold and still total correctly.
  const resolved = new Map<string, { booking: Booking; appts: any[] }>();
  const blocked: string[] = [];
  for (const a of unpriced) {
    const label = `${a.pet} (${a.first_name} ${a.last_name}) ${a.dt}`;
    let bk = a.b ? byId.get(String(a.b)) : undefined;
    if (!bk) {
      const hits = byPetDate.get(`${norm(a.pet)}|${a.dt}`) ?? [];
      if (hits.length > 1) { blocked.push(`${label}: ${hits.length} MoeGo bookings for that pet and date — ambiguous`); continue; }
      bk = hits[0];
    }
    if (!bk) { blocked.push(`${label}: no matching MoeGo booking`); continue; }
    if (bk.net === 0) { blocked.push(`${label}: MoeGo records $0 for booking ${bk.id}`); continue; }
    if (bk.pets.length > 1 && !bk.sameService) {
      blocked.push(`${label}: booking ${bk.id} has ${bk.pets.length} dogs on different services — cannot apportion`);
      continue;
    }
    if (!resolved.has(bk.id)) resolved.set(bk.id, { booking: bk, appts: [] });
    resolved.get(bk.id)!.appts.push(a);
  }

  type Write = { id: number; price: number; gross: number; why: string };
  const writes: Write[] = [];
  for (const { booking, appts } of resolved.values()) {
    const n = Math.max(1, booking.pets.length);
    const share = Math.round((booking.net / n) * 100) / 100;
    const grossShare = Math.round((booking.expected / n) * 100) / 100;
    // Any rounding remainder goes to the first dog, so the booking still
    // totals exactly what MoeGo collected rather than drifting by a cent.
    const holdsAll = appts.length === n;
    appts.forEach((a, i) => {
      let price = share, gross = grossShare;
      if (holdsAll && i === 0) {
        price = Math.round((booking.net - share * (n - 1)) * 100) / 100;
        gross = Math.round((booking.expected - grossShare * (n - 1)) * 100) / 100;
      }
      writes.push({ id: a.id, price, gross,
        why: `${a.pet} (${a.first_name} ${a.last_name}) ${a.dt}  $${price.toFixed(2)}${n > 1 ? `  (1/${n} of $${booking.net.toFixed(2)}, booking ${booking.id})` : `  (booking ${booking.id})`}` });
    });
  }

  const total = writes.reduce((s, w) => s + w.price, 0);
  console.log(`PLAN — ${writes.length} price(s), $${total.toFixed(2)}${APPLY ? "" : "   (DRY RUN, nothing written)"}\n`);
  writes.slice(0, 10).forEach((w, i) => console.log(`  ${String(i+1).padStart(3)}. ${w.why}`));
  if (writes.length > 10) console.log(`  … and ${writes.length - 10} more`);
  console.log(`\nHELD BACK — ${blocked.length}`);
  const reasons = new Map<string, number>();
  blocked.forEach((b) => { const r = b.split(": ")[1].replace(/\d+/g, "N"); reasons.set(r, (reasons.get(r) ?? 0) + 1); });
  [...reasons].forEach(([r, n]) => console.log(`  ${String(n).padStart(3)} × ${r}`));

  if (!APPLY) { console.log(`\nDRY RUN. Re-run with --apply to write.`); await db.end(); return; }

  await db.beginTransaction();
  try {
    for (const w of writes) {
      const [r] = (await db.execute(
        `UPDATE appointments SET price=?, gross_price=? WHERE id=? AND price IS NULL AND workflow_state='complete'`,
        [w.price.toFixed(2), w.gross.toFixed(2), w.id])) as any;
      if ((r.affectedRows ?? 0) !== 1) throw new Error(`appointment ${w.id} affected ${r.affectedRows} rows`);
    }
    await db.commit();
    console.log(`\nCOMMITTED ${writes.length} prices totalling $${total.toFixed(2)}.`);
  } catch (e: any) {
    await db.rollback();
    console.error(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await db.end();
})();

/**
 * Give every dog a size band, derived from the service MoeGo booked it under.
 *
 *   corepack pnpm exec tsx scripts/moego-size-bands.ts "<export.xlsx>" [...]   # dry run
 *   corepack pnpm exec tsx scripts/moego-size-bands.ts "<export.xlsx>" --apply # write
 *
 * Run through tsx, not bare node: shared/ uses extensionless imports, which
 * node's own TypeScript stripping will not resolve. `pnpm dev` runs the
 * server the same way.
 *
 * ── Why a band and not a weight ────────────────────────────────────────────
 *
 * MoeGo holds a weight on the pet profile and puts it in NO export available
 * here — not the client export (which carries breed only) and not the
 * appointment reports. What it does carry is the band, spelled out in the
 * service name: "Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic".
 *
 * So this writes pets.size_band, never pets.weight_kg. A dog in the 17–25 kg
 * band has not been weighed, and putting 21 kg on its record would turn a
 * guess into something the app treats as measured — weight_kg drives the
 * automatic duration and is shown to staff as fact.
 *
 * ── The guards ─────────────────────────────────────────────────────────────
 *
 *  - Dry run by default. --apply is the only way to write.
 *  - One transaction, with a count assertion. Any surprise rolls it all back.
 *  - A dog is matched on CLIENT AND PET, never pet alone. "Minnie (Janene
 *    Bosa)" and "Minnie (Liz Thomas)" are different dogs, and matching on the
 *    name alone wrote to the wrong owner's dog in testing on 30/09/2026.
 *  - A multi-pet booking is only used when pets and services line up one to
 *    one. "Archie,George" against three services cannot be aligned, and
 *    filing one dog under the other's size is worse than leaving both blank.
 *  - A dog whose bands disagree across its history takes its MOST RECENT,
 *    and the disagreement is reported. Dogs grow, and the salon reclassifies.
 *  - Never overwrites a band a human set, or one derived from a weight
 *    they recorded (size_band_source 'manual' or 'weighed').
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";
import { bandFromServiceText, sizeBandSourceIsHuman, type DogSizeBand } from "../shared/dogSizeBand.ts";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("Usage: corepack pnpm exec tsx scripts/moego-size-bands.ts <export.xlsx> [...] [--apply]");
  process.exit(1);
}

function readSheet(path: string) {
  const unzip = (entry: string) =>
    execFileSync("unzip", ["-p", path, entry], { maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  const strings = parseSharedStrings(unzip("xl/sharedStrings.xml"));
  return parseSheet(unzip("xl/worksheets/sheet1.xml"), strings);
}

/** Split a comma-joined MoeGo cell, trimming and dropping blanks. */
const split = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

/** MoeGo client ids arrive as "#21096407". */
const clientId = (value: string) => value.replace(/^#/, "").trim();

/** Pet names are matched case- and space-insensitively, as elsewhere. */
const petKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

type Observation = { band: DogSizeBand; date: string; service: string };
type Unresolved = { client: string; pet: string; reason: string; service: string };

const observed = new Map<string, Observation[]>();
const unresolved: Unresolved[] = [];
let rowsSeen = 0;
let rowsWithPets = 0;

for (const file of files) {
  const rows = readSheet(file);
  if (rows.length === 0) continue;
  const header = rows[0].map((c) => String(c ?? "").trim());
  const at = (name: string) => header.indexOf(name);
  const iPet = at("Pet name");
  const iSvc = at("Services");
  const iClient = at("Client ID");
  const iName = at("Client name");
  const iDate = at("Appointment date");
  if (iPet < 0 || iSvc < 0 || iClient < 0) {
    console.error(`! ${file}: missing Pet name / Services / Client ID — skipped`);
    continue;
  }

  for (const row of rows.slice(1)) {
    rowsSeen++;
    const pets = split(String(row[iPet] ?? ""));
    if (pets.length === 0) continue;
    rowsWithPets++;
    const services = split(String(row[iSvc] ?? ""));
    const cid = clientId(String(row[iClient] ?? ""));
    const cname = String(row[iName] ?? "");
    const date = String(row[iDate] ?? "");
    if (!cid) continue;

    // Three cases, in order:
    //
    //  1 pet                  — every service on the booking is that dog's.
    //  N pets, N services     — MoeGo aligns them by position.
    //  N pets, 1 service      — MoeGo DEDUPLICATES the service list, so one
    //                           service across several dogs means they all
    //                           had it. Checked against the 2018–2027 export:
    //                           of 1,424 rows carrying several services, NOT
    //                           ONE repeats a service. If MoeGo listed per
    //                           dog without deduplicating, the 3,018 two-dog
    //                           bookings sharing a service would show it
    //                           twice. Zero is decisive.
    //
    // Anything else — 3 pets against 2 services — cannot be aligned, and
    // filing one dog under another's size is worse than leaving both blank.
    const perPet: Array<{ pet: string; text: string } | null> =
      pets.length === 1
        ? [{ pet: pets[0], text: services.join(",") }]
        : pets.length === services.length
          ? pets.map((pet, i) => ({ pet, text: services[i] }))
          : services.length === 1
            ? pets.map((pet) => ({ pet, text: services[0] }))
            : pets.map(() => null);

    pets.forEach((pet, i) => {
      const slot = perPet[i];
      if (!slot) {
        unresolved.push({
          client: `${cname} (${cid})`, pet,
          reason: `${pets.length} pets against ${services.length} services — cannot align`,
          service: services.join(" | "),
        });
        return;
      }
      const match = bandFromServiceText(slot.text);
      if (match.band === null) {
        if (match.reason !== "no_band_in_text") {
          unresolved.push({ client: `${cname} (${cid})`, pet, reason: match.reason, service: slot.text });
        }
        return;
      }
      const key = `${cid}::${petKey(pet)}`;
      if (!observed.has(key)) observed.set(key, []);
      observed.get(key)!.push({ band: match.band, date, service: slot.text });
    });
  }
}

/** DD/MM/YYYY to something sortable. */
function sortableDate(d: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

const decided = new Map<string, { band: DogSizeBand; changed: boolean; seen: number }>();
let disagreements = 0;
for (const [key, list] of observed) {
  list.sort((a, b) => sortableDate(a.date).localeCompare(sortableDate(b.date)));
  const bands = new Set(list.map((o) => o.band));
  const latest = list[list.length - 1].band;
  if (bands.size > 1) disagreements++;
  decided.set(key, { band: latest, changed: bands.size > 1, seen: list.length });
}

console.log(`\nMoeGo exports read: ${files.length}`);
console.log(`  appointment rows:      ${rowsSeen}`);
console.log(`  rows naming a pet:     ${rowsWithPets}`);
console.log(`  dogs with a band:      ${decided.size}`);
console.log(`  dogs whose band changed over time (most recent wins): ${disagreements}`);
console.log(`  rows left unresolved:  ${unresolved.length}`);

const byBand = new Map<string, number>();
for (const d of decided.values()) byBand.set(d.band, (byBand.get(d.band) ?? 0) + 1);
console.log("\nBands:");
for (const [band, n] of [...byBand].sort((a, b) => b[1] - a[1])) console.log(`  ${band.padEnd(14)} ${n}`);

if (unresolved.length) {
  const reasons = new Map<string, number>();
  for (const u of unresolved) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1);
  console.log("\nUnresolved, by reason:");
  for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${reason}`);
}

// ── Match to Groomigo ──────────────────────────────────────────────────────
const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

const [petRows] = (await db.query(`
  SELECT p.id, p.name, p.size_band, p.size_band_source, c.moego_client_id
  FROM pets p JOIN clients c ON c.id = p.client_id
  WHERE p.tenant_id = 1 AND c.moego_client_id IS NOT NULL
`)) as any;

const groomigo = new Map<string, Array<{ id: number; band: string | null; source: string | null }>>();
for (const r of petRows) {
  const key = `${String(r.moego_client_id).trim()}::${petKey(r.name)}`;
  if (!groomigo.has(key)) groomigo.set(key, []);
  groomigo.get(key)!.push({ id: r.id, band: r.size_band, source: r.size_band_source });
}

const toWrite: Array<{ id: number; band: DogSizeBand }> = [];
let noMatch = 0, ambiguousMatch = 0, alreadySame = 0, manual = 0;
for (const [key, decision] of decided) {
  const hits = groomigo.get(key);
  if (!hits || hits.length === 0) { noMatch++; continue; }
  if (hits.length > 1) { ambiguousMatch++; continue; }
  const pet = hits[0];
  // Never undo a band a groomer set, or one derived from a weight they
  // recorded. Both are better evidence than a MoeGo service name.
  if (sizeBandSourceIsHuman(pet.source)) { manual++; continue; }
  if (pet.band === decision.band) { alreadySame++; continue; }
  toWrite.push({ id: pet.id, band: decision.band });
}

console.log(`\nAgainst Groomigo:`);
console.log(`  would set a band on:   ${toWrite.length} dogs`);
console.log(`  already correct:       ${alreadySame}`);
console.log(`  human-set, left alone: ${manual}`);
console.log(`  no matching dog:       ${noMatch}`);
console.log(`  more than one match:   ${ambiguousMatch}`);

// The number that actually matters. Banding 2,000 dogs is no use if the
// ones the salon still sees are the ones left blank.
const ids = new Set(toWrite.map((r) => r.id));
const [activeRows] = (await db.query(`
  SELECT DISTINCT p.id
  FROM pets p JOIN appointments a ON a.pet_id = p.id
  WHERE p.tenant_id = 1 AND a.scheduled_start >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
`)) as any;
const active = activeRows.map((r: any) => r.id);
const activeCovered = active.filter((id: number) => ids.has(id)).length;
console.log(`\nDogs seen in the last 12 months: ${active.length}`);
console.log(`  of those, would get a band:  ${activeCovered} (${Math.round((activeCovered / Math.max(1, active.length)) * 100)}%)`);
const missing = active.filter((id: number) => !ids.has(id));
if (missing.length) {
  const [names] = (await db.query(
    `SELECT p.id, p.name, c.first_name, c.last_name FROM pets p
     JOIN clients c ON c.id = p.client_id WHERE p.id IN (${missing.map(() => "?").join(",")})`,
    missing,
  )) as any;
  console.log(`  active dogs left without one: ${names.length}`);
  for (const n of names.slice(0, 15)) console.log(`     ${n.name} (${n.first_name} ${n.last_name})`);
  if (names.length > 15) console.log(`     ... and ${names.length - 15} more`);
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${toWrite.length} bands.`);
  await db.end();
  process.exit(0);
}

await db.beginTransaction();
try {
  let written = 0;
  for (const row of toWrite) {
    const [res] = (await db.execute(
      `UPDATE pets SET size_band = ?, size_band_source = 'moego_service'
       WHERE id = ? AND tenant_id = 1
         AND (size_band_source IS NULL OR size_band_source NOT IN ('manual', 'weighed'))`,
      [row.band, row.id],
    )) as any;
    if (res.affectedRows !== 1) throw new Error(`pet ${row.id}: expected 1 row, touched ${res.affectedRows}`);
    written++;
  }
  if (written !== toWrite.length) throw new Error(`wrote ${written}, expected ${toWrite.length}`);
  await db.commit();
  console.log(`\nWROTE ${written} size bands.`);
} catch (error) {
  await db.rollback();
  console.error("\nROLLED BACK:", (error as Error).message);
  process.exitCode = 1;
}
await db.end();

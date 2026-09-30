/**
 * MoeGo -> Groomigo reconciliation: report, and optionally apply cancellations.
 *
 *   node scripts/moego-apply.ts "<export.xlsx>"            # dry run (default)
 *   node scripts/moego-apply.ts "<export.xlsx>" --apply    # write cancellations
 *   node scripts/moego-apply.ts "<export.xlsx>" --days 21  # widen the window
 *
 * ── What it writes, and what it deliberately does not ──────────────────────
 *
 * It CANCELS dogs that MoeGo says are cancelled and Groomigo still has live.
 * That is the failure that put four cancelled dogs on the salon board on the
 * morning of 29/09/2026, and it is safe to automate because it only ever
 * removes work, never invents it.
 *
 * It does NOT create the appointments MoeGo has and Groomigo is missing. The
 * appointment-list export carries "Appointment date" and no start time - only
 * "Created time", which is when the booking was made. Creating from it would
 * mean inventing a time and putting a real dog in the wrong slot on a real
 * groomer's day. Those rows are printed for a human to enter, with everything
 * the export does give.
 *
 * ── The guards, and why each one is here ───────────────────────────────────
 *
 *  - Dry run by default. --apply is the only way to write.
 *  - One transaction. Any surprise rolls the whole thing back.
 *  - Every UPDATE is guarded with `workflow_state = 'scheduled'` and asserts
 *    it touched exactly one row. A dog that has been CHECKED IN is physically
 *    at the salon: MoeGo's cancellation is stale and must not be applied, or
 *    the board loses a dog that is standing in it.
 *  - Today forward only. Cancelling a past appointment rewrites history and
 *    moves revenue figures that have already been reported.
 *  - Every change writes a workflow_logs row, because that audit trail is
 *    what the Pet Tracker and the timing analytics are built on.
 *  - The export's age is checked and printed. A stale export describes a
 *    board that has since moved - see Trap 6 in the moego-monday-sync skill.
 *
 * Multi-dog bookings: MoeGo puts several dogs in one row ("Rosie,Teddy") and
 * Groomigo holds a row per dog, so pet names are split before matching or
 * every family booking reads as both missing and extra.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";
import { brisbaneDate } from "../shared/businessDays.ts";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const XLSX = args.find((a) => !a.startsWith("--"));
const APPLY = args.includes("--apply");
const DAYS = Number(args[args.indexOf("--days") + 1]) || 14;

if (!XLSX) {
  console.error('Usage: node scripts/moego-apply.ts "<Appointment list report.xlsx>" [--apply] [--days N]');
  process.exit(1);
}

const now = new Date();
const FROM = brisbaneDate(now);
const TO = brisbaneDate(new Date(now.getTime() + DAYS * 864e5));

// ── Trap 6: an export goes stale, and a stale export describes a board that
// has since moved. Say how old it is rather than letting it pass silently.
const ageHours = (Date.now() - statSync(XLSX).mtimeMs) / 36e5;
console.log(`Export:   ${XLSX}`);
console.log(`          ${ageHours.toFixed(1)} hours old${ageHours > 2 ? "  <-- RE-EXPORT BEFORE APPLYING" : ""}`);
console.log(`Window:   ${FROM} .. ${TO}  (${DAYS} days, Brisbane)`);
console.log(`Mode:     ${APPLY ? "APPLY - will write cancellations" : "DRY RUN - writes nothing"}\n`);

// ── Read the export ────────────────────────────────────────────────────────
const unzip = (entry: string) =>
  execFileSync("unzip", ["-p", XLSX, entry], { maxBuffer: 4e8 }).toString("utf8");
const rows = parseSheet(unzip("xl/worksheets/sheet1.xml"), parseSharedStrings(unzip("xl/sharedStrings.xml")));
const header = rows[0].map((h) => (h ?? "").trim());
const at = (name: string) => {
  const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`Export is missing the "${name}" column - MoeGo may have changed the report`);
  return i;
};
const COL = {
  id: at("Booking ID"), date: at("Appointment date"), client: at("Client name"),
  pet: at("Pet name"), status: at("Status"), services: at("Services"),
  staff: at("Staffs"), duration: at("Estimate duration"), gross: at("Gross sales"),
};

// The export writes dates as MM/DD/YYYY or DD/MM/YYYY depending on the
// exporting account's locale. Decide from the data: a first component above
// 12 can only be a day.
const dayFirst = rows.slice(1).some((r) => Number((r[COL.date] ?? "").split("/")[0]) > 12);
const iso = (v: string) => {
  const p = (v ?? "").split("/");
  if (p.length !== 3) return "";
  const [a, b, y] = p;
  const [d, m] = dayFirst ? [a, b] : [b, a];
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
console.log(`Date format detected: ${dayFirst ? "DD/MM/YYYY" : "MM/DD/YYYY"}`);

const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const isDead = (s: string) => /cancel|no.?show/i.test(s ?? "");

type MoegoRow = {
  bookingId: string; date: string; client: string; pet: string;
  status: string; services: string; staff: string; duration: string; gross: string;
};
const moego: MoegoRow[] = rows.slice(1).flatMap((r) => {
  const date = iso(r[COL.date]);
  if (date < FROM || date > TO) return [];
  const base = {
    bookingId: (r[COL.id] ?? "").replace("#", ""), date,
    client: (r[COL.client] ?? "").trim(), status: (r[COL.status] ?? "").trim(),
    services: (r[COL.services] ?? "").trim(), staff: (r[COL.staff] ?? "").trim(),
    duration: (r[COL.duration] ?? "").trim(), gross: (r[COL.gross] ?? "").trim(),
  };
  return (r[COL.pet] ?? "").split(",").map((p) => p.trim()).filter(Boolean)
    .map((pet) => ({ ...base, pet }));
});
console.log(`MoeGo dog-appointments in window: ${moego.length}\n`);

// ── Read Groomigo ──────────────────────────────────────────────────────────
const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

type GsosRow = {
  id: number; d: string; pet: string; client: string;
  ws: string; st: string; tenant_id: number;
};
const [gsos] = await db.query<any[]>(
  `SELECT a.id, a.tenant_id,
          DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') AS d,
          TIME_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%H:%i')    AS t,
          p.name AS pet, CONCAT(cl.first_name,' ',cl.last_name) AS client,
          a.workflow_state AS ws, a.status AS st
     FROM appointments a
     LEFT JOIN pets p    ON p.id  = a.pet_id
     LEFT JOIN clients cl ON cl.id = a.client_id
    WHERE DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')) BETWEEN ? AND ?`,
  [FROM, TO],
);
console.log(`Groomigo appointments in window:  ${gsos.length}\n`);

const gsosDead = (g: GsosRow) =>
  ["cancelled", "no_show"].includes(g.ws) || ["cancelled", "no_show"].includes(g.st);
/**
 * Match on pet AND client AND date, never pet and date alone.
 *
 * The salon has two Louis on 06/10 (Varinia Taylor's and Judy Harris's) and
 * two Lily on 13/10. Keyed on the dog's name and the date, one MoeGo
 * cancellation matched both, and applying it would have cancelled a dog whose
 * owner is still expecting to come in. Where the client names do not line up,
 * the row is reported for a human rather than guessed at.
 */
const key = (pet: string, client: string, date: string) => `${norm(pet)}|${norm(client)}|${date}`;
const looseKey = (pet: string, date: string) => `${norm(pet)}|${date}`;

const byKey = new Map<string, GsosRow[]>();
const byLooseKey = new Map<string, GsosRow[]>();
for (const g of gsos as GsosRow[]) {
  const k = key(g.pet ?? "", g.client ?? "", g.d);
  byKey.set(k, [...(byKey.get(k) ?? []), g]);
  const lk = looseKey(g.pet ?? "", g.d);
  byLooseKey.set(lk, [...(byLooseKey.get(lk) ?? []), g]);
}
const moegoByKey = new Map<string, MoegoRow[]>();
for (const m of moego) {
  const k = key(m.pet, m.client, m.date);
  moegoByKey.set(k, [...(moegoByKey.get(k) ?? []), m]);
}

// ── 1. Cancel: MoeGo says cancelled, Groomigo still has it live ────────────
type Planned = { g: GsosRow; m: MoegoRow; skip?: string };
const planned: Planned[] = [];
const ambiguous: { m: MoegoRow; candidates: GsosRow[] }[] = [];
for (const m of moego) {
  if (!isDead(m.status)) continue;
  const exact = (byKey.get(key(m.pet, m.client, m.date)) ?? []).filter((g) => !gsosDead(g));
  if (exact.length === 0) {
    // No client match. If a dog of that name is booked that day under some
    // OTHER client, that is a name collision, not this cancellation.
    const loose = (byLooseKey.get(looseKey(m.pet, m.date)) ?? []).filter((g) => !gsosDead(g));
    if (loose.length) ambiguous.push({ m, candidates: loose });
    continue;
  }
  for (const g of exact) {
    // Only a dog that has not arrived may be cancelled.
    planned.push({
      g, m,
      skip: g.ws === "scheduled" ? undefined
        : `already ${g.ws} - the dog is at the salon, MoeGo's cancellation is stale`,
    });
  }
}
const toCancel = planned.filter((p) => !p.skip);
const blocked = planned.filter((p) => p.skip);

console.log(`=== CANCEL: live in Groomigo, cancelled in MoeGo (${planned.length}) ===`);
for (const p of planned) {
  const mark = p.skip ? "SKIP " : "CANCEL";
  console.log(`  ${mark}  ${p.g.d} ${(p.g as any).t}  ${p.g.pet} (${p.g.client})  appt #${p.g.id}${p.skip ? `  -- ${p.skip}` : ""}`);
}

if (ambiguous.length) {
  console.log(`\n=== AMBIGUOUS (${ambiguous.length}) - same dog name, different owner. NOT cancelled, check by hand ===`);
  for (const a of ambiguous) {
    console.log(`  MoeGo says cancelled: ${a.m.date}  ${a.m.pet} (${a.m.client})  #${a.m.bookingId}`);
    for (const g of a.candidates) {
      console.log(`      Groomigo has:      ${g.d} ${(g as any).t}  ${g.pet} (${g.client})  appt #${g.id}`);
    }
  }
}

// ── 2. Report: in MoeGo, missing from Groomigo. Never created automatically ─
const missing = moego.filter(
  (m) => !isDead(m.status) && !(byKey.get(key(m.pet, m.client, m.date)) ?? []).some((g) => !gsosDead(g)),
);
console.log(`\n=== MISSING from Groomigo (${missing.length}) - enter by hand, the export has no start time ===`);
for (const m of missing) {
  console.log(`  ${m.date}  ${m.pet} (${m.client})  ${m.services.slice(0, 48)}  ${m.duration}  staff: ${m.staff}  MoeGo #${m.bookingId}`);
}

// ── 3. Report: in Groomigo, not in MoeGo at all ────────────────────────────
const extra = (gsos as GsosRow[]).filter(
  (g) => !gsosDead(g) && !(moegoByKey.get(key(g.pet ?? "", g.client ?? "", g.d)) ?? []).some((m) => !isDead(m.status)),
);
console.log(`\n=== IN GROOMIGO, not in this MoeGo export (${extra.length}) - booked here, or the export is stale ===`);
for (const g of extra) console.log(`  ${g.d} ${(g as any).t}  ${g.pet} (${g.client})  ${g.ws}/${g.st}  appt #${g.id}`);

// ── Apply ──────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log(`\nDry run. Nothing was written. Re-run with --apply to cancel the ${toCancel.length} appointment(s) above.`);
  await db.end();
  process.exit(0);
}

if (toCancel.length === 0) {
  console.log("\nNothing to cancel.");
  await db.end();
  process.exit(0);
}

console.log(`\nApplying ${toCancel.length} cancellation(s)...`);
await db.beginTransaction();
try {
  for (const { g, m } of toCancel) {
    // Guarded on workflow_state so a dog checked in between the plan above
    // and this write is not cancelled out from under the salon floor.
    const [res] = await db.query<any>(
      `UPDATE appointments
          SET workflow_state = 'cancelled', status = 'cancelled', updated_at = NOW()
        WHERE id = ? AND workflow_state = 'scheduled'`,
      [g.id],
    );
    if (res.affectedRows !== 1) {
      throw new Error(
        `appointment #${g.id} (${g.pet}, ${g.d}) updated ${res.affectedRows} rows, expected exactly 1 - ` +
        `it changed state while this script was running. Rolling everything back.`,
      );
    }
    await db.query(
      `INSERT INTO workflow_logs (appointment_id, from_state, to_state, changed_at_ms, changed_at, notes)
       VALUES (?, 'scheduled', 'cancelled', ?, NOW(), ?)`,
      [g.id, Date.now(), `Cancelled in MoeGo (booking #${m.bookingId}, status "${m.status}") - applied by moego-apply.ts`],
    );
    console.log(`  cancelled  ${g.d}  ${g.pet} (${g.client})  appt #${g.id}`);
  }
  await db.commit();
  console.log(`\nCommitted ${toCancel.length} cancellation(s).`);
} catch (err) {
  await db.rollback();
  console.error(`\nROLLED BACK - nothing was written.\n${err instanceof Error ? err.message : String(err)}`);
  await db.end();
  process.exit(1);
}

if (blocked.length) {
  console.log(`\n${blocked.length} left alone because the dog has already arrived - check these by hand:`);
  for (const p of blocked) console.log(`  ${p.g.d}  ${p.g.pet} (${p.g.client})  ${p.skip}`);
}
console.log(`\n${missing.length} appointment(s) still need entering by hand - see the MISSING list above.`);
await db.end();

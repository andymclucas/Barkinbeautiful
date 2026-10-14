/**
 * Monday sync, 12/10/2026 — DIVERGENCE REPORT ONLY. Writes nothing.
 *
 *   node scripts/moego-sync-2026-10-12.ts "<schedules.xlsx>" "<cancelled.xlsx>"
 *
 * Pull is 21 days (12/10–02/11); the comparison is the 14-day window
 * 12/10–26/10, so a short reschedule out of the window resolves itself
 * instead of masquerading as a deletion (Trap 9).
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";
import { parseMoegoPets } from "../shared/moegoImport.ts";
import { moegoStaffKey } from "../shared/moegoStaffAlias.ts";
dotenv.config({ quiet: true });

const [SCHED, CANX] = process.argv.slice(2);
if (!SCHED || !CANX) { console.error("need both xlsx paths"); process.exit(1); }

const WINDOW_DAYS = 14;
const today = "2026-10-12";
const windowEnd = "2026-10-26";

const read = (path: string) => {
  const unzip = (entry: string, optional = false) => {
    try {
      return execFileSync("unzip", ["-p", path, entry], { maxBuffer: 4e8, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    } catch (err) {
      // These exports carry inline strings and ship no sharedStrings.xml at
      // all, so its absence is normal rather than a broken file.
      if (optional) return "";
      throw err;
    }
  };
  return parseSheet(unzip("xl/worksheets/sheet1.xml"), parseSharedStrings(unzip("xl/sharedStrings.xml", true)));
};

const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// The alias map used to be written out here, and in
// moego-three-clients-2026-10-12.ts, and the two had already drifted — this
// copy never knew "Bather". That is what left 107 imported bookings with
// nobody against them. One copy now, in shared/moegoStaffAlias.ts.
/** MoeGo writes 30/10/2026; we compare on ISO. */
const toIso = (d: string) => {
  const m = String(d ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};

// ── MoeGo: live schedule, expanded per dog ───────────────────────────────────
const sRows = read(SCHED);
const sHead = sRows[0].map((h) => String(h ?? "").trim());
const sIdx = (n: string) => sHead.findIndex((h) => h.toLowerCase() === n.toLowerCase());
const C = {
  booking: sIdx("Booking ID"), date: sIdx("Date"), time: sIdx("Time"),
  client: sIdx("Client ID"), first: sIdx("First name"), last: sIdx("Last name"),
  phone: sIdx("Primary number"), pets: sIdx("Pet name"),
  services: sIdx("Service & add ons"), staffs: sIdx("Staffs"), status: sIdx("Status"),
};

type MoegoDog = {
  booking: string; dateIso: string; time: string; clientId: string;
  who: string; phone: string; pet: string; service: string; staff: string; status: string;
  alignmentOk: boolean;
};
const moegoDogs: MoegoDog[] = [];
const statusTally: Record<string, number> = {};
const alignmentProblems: string[] = [];

for (const r of sRows.slice(1)) {
  const booking = String(r[C.booking] ?? "").trim();
  if (!booking) continue;
  const status = String(r[C.status] ?? "").trim();
  statusTally[status || "(blank)"] = (statusTally[status || "(blank)"] ?? 0) + 1;

  const pets = parseMoegoPets(String(r[C.pets] ?? "")).map((p) => p.name).filter(Boolean);
  const services = String(r[C.services] ?? "").split(",").map((s) => s.trim());
  const staffs = String(r[C.staffs] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Trap 3: if the comma-joined columns disagree, flag rather than guess.
  const alignmentOk = pets.length > 0 && (staffs.length === pets.length || staffs.length === 1 || staffs.length === 0);
  if (!alignmentOk) alignmentProblems.push(`${booking}: ${pets.length} pets, ${staffs.length} staff`);

  pets.forEach((pet, i) => {
    moegoDogs.push({
      booking, dateIso: toIso(String(r[C.date] ?? "")), time: String(r[C.time] ?? "").trim(),
      clientId: String(r[C.client] ?? "").trim(),
      who: `${String(r[C.first] ?? "").trim()} ${String(r[C.last] ?? "").trim()}`.trim(),
      phone: String(r[C.phone] ?? "").trim(), pet,
      service: services[i] ?? services[0] ?? "",
      staff: staffs.length === 1 ? staffs[0] : (staffs[i] ?? ""),
      status, alignmentOk,
    });
  });
}

// ── MoeGo: cancellations (booking-level, no pet names) ───────────────────────
const cRows = read(CANX);
const cHead = cRows[0].map((h) => String(h ?? "").trim());
const cIdx = (n: string) => cHead.findIndex((h) => h.toLowerCase() === n.toLowerCase());
type Canx = { booking: string; dateIso: string; who: string; cancelledOn: string; reason: string };
const cancellations: Canx[] = [];
for (const r of cRows.slice(1)) {
  const booking = String(r[cIdx("Booking ID")] ?? "").trim();
  if (!booking) continue;
  cancellations.push({
    booking, dateIso: toIso(String(r[cIdx("Date")] ?? "")),
    who: `${String(r[cIdx("First name")] ?? "").trim()} ${String(r[cIdx("Last name")] ?? "").trim()}`.trim(),
    cancelledOn: String(r[cIdx("Cancelled date")] ?? "").trim(),
    reason: String(r[cIdx("Cancel reason")] ?? "").trim(),
  });
}

(async () => {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [gRows] = (await db.query(`
    SELECT a.id, a.moego_appointment_id AS booking, a.pet_id, a.workflow_state, a.status,
           DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') AS d,
           TIME_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%h:%i %p') AS t,
           p.name AS pet, cl.id AS client_id, cl.first_name, cl.last_name,
           st.name AS staff_name
    FROM appointments a
    JOIN pets p ON p.id = a.pet_id
    JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN staff st ON st.id = a.staff_id
    WHERE DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')) BETWEEN ? AND ?`,
    [today, windowEnd])) as any;
  await db.end();

  const inWindow = (iso: string) => iso >= today && iso <= windowEnd;
  const key = (booking: string, pet: string) => `${booking}|${norm(pet)}`;

  const moegoInWindow = moegoDogs.filter((d) => inWindow(d.dateIso));
  const gLive = gRows.filter((g: any) => g.workflow_state === "scheduled");
  const gByKey = new Map<string, any>();
  for (const g of gRows) if (g.booking) gByKey.set(key(String(g.booking), g.pet), g);

  // Bucket 1 — cancelled in MoeGo, still live in Groomigo
  const canxBookings = new Set(cancellations.filter((c) => inWindow(c.dateIso)).map((c) => c.booking));
  const bucket1 = gLive.filter((g: any) => g.booking && canxBookings.has(String(g.booking)));

  // Bucket 2 — in MoeGo, absent from Groomigo
  const bucket2 = moegoInWindow.filter((d) => !gByKey.has(key(d.booking, d.pet)));

  // Bucket 3 — live in Groomigo, absent from the MoeGo pull entirely
  const moegoAllKeys = new Set(moegoDogs.map((d) => key(d.booking, d.pet)));
  const bucket3 = gLive.filter((g: any) =>
    g.booking && !moegoAllKeys.has(key(String(g.booking), g.pet)) && !canxBookings.has(String(g.booking)));

  // Bucket 4 — in both, a field differs
  const bucket4: string[] = [];
  for (const d of moegoInWindow) {
    const g = gByKey.get(key(d.booking, d.pet));
    if (!g || g.workflow_state !== "scheduled") continue;
    const diffs: string[] = [];
    if (g.d !== d.dateIso) diffs.push(`date ${g.d} → ${d.dateIso}`);
    if (d.time && norm(g.t) !== norm(d.time)) diffs.push(`time ${g.t} → ${d.time}`);
    if (d.staff && g.staff_name && moegoStaffKey(g.staff_name) !== moegoStaffKey(d.staff)) {
      diffs.push(`staff ${g.staff_name} → ${d.staff}`);
    }
    if (diffs.length) bucket4.push(`  ${d.pet} (${d.who}) #${d.booking}: ${diffs.join("; ")}`);
  }

  const P = console.log;
  P(`MoeGo → Groomigo divergence, ${today} .. ${windowEnd} (${WINDOW_DAYS} days)`);
  P(`Pulled 12/10–02/11; compared ${WINDOW_DAYS} days.\n`);
  P(`MoeGo schedule rows: ${sRows.length - 1} bookings → ${moegoDogs.length} dogs (${moegoInWindow.length} in window)`);
  P(`MoeGo status tally: ${JSON.stringify(statusTally)}`);
  P(`MoeGo cancellations: ${cancellations.length} (${cancellations.filter((c) => inWindow(c.dateIso)).length} in window)`);
  P(`Groomigo rows in window: ${gRows.length} (${gLive.length} still scheduled)\n`);

  P(`BUCKET 1 — cancelled in MoeGo, still live in Groomigo: ${bucket1.length}`);
  for (const g of bucket1) {
    const c = cancellations.find((x) => x.booking === String(g.booking));
    P(`  ${g.pet} (${g.first_name} ${g.last_name}) ${g.d} ${g.t} #${g.booking} — cancelled ${c?.cancelledOn ?? "?"}${c?.reason ? `, ${c.reason}` : ""}`);
  }
  P(`\nBUCKET 2 — in MoeGo, absent from Groomigo: ${bucket2.length}`);
  for (const d of bucket2) P(`  ${d.pet} (${d.who}) ${d.dateIso} ${d.time} #${d.booking} [${d.status}] staff=${d.staff || "—"} svc=${d.service.slice(0, 40)}`);
  P(`\nBUCKET 3 — live in Groomigo, absent from MoeGo: ${bucket3.length}`);
  for (const g of bucket3) P(`  ${g.pet} (${g.first_name} ${g.last_name}) ${g.d} ${g.t} #${g.booking}`);
  P(`\nBUCKET 4 — in both, fields differ: ${bucket4.length}`);
  bucket4.forEach((l) => P(l));
  P(`\nALIGNMENT PROBLEMS (Trap 3): ${alignmentProblems.length}`);
  alignmentProblems.slice(0, 10).forEach((l) => P(`  ${l}`));
  P(`\nNOTHING WAS WRITTEN.`);
})();

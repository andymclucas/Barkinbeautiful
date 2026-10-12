/**
 * Monday sync 12/10/2026 — APPLY. Dry run unless --apply is passed.
 *
 *   node scripts/moego-apply-2026-10-12.ts "<schedules.xlsx>" "<cancelled.xlsx>"
 *   node scripts/moego-apply-2026-10-12.ts "<schedules.xlsx>" "<cancelled.xlsx>" --apply
 *
 * Creates, reassignments and time moves are RE-DERIVED from the exports on
 * every run rather than transcribed from the report, so the script cannot
 * drift from what MoeGo actually says. The single exception is Jersey, whose
 * replacement bookings fall outside the pulled window; that one carries its
 * evidence in a comment and is guarded by an exact-match assertion.
 *
 * Everything runs in ONE transaction and rolls back whole on any surprise.
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";
import { parseMoegoPets } from "../shared/moegoImport.ts";
dotenv.config({ quiet: true });

const rawArgs = process.argv.slice(2);
const [SCHED, CANX] = rawArgs.filter((a, i) => !a.startsWith("--") && rawArgs[i - 1] !== "--until");
const APPLY = process.argv.includes("--apply");
if (!SCHED || !CANX) { console.error("need both xlsx paths"); process.exit(1); }

const TENANT = 1;
const TODAY = "2026-10-12";
/**
 * How far out to reconcile. Defaults to the fortnight the skill describes;
 * `--until YYYY-MM-DD` widens it, up to whatever the export actually covers.
 *
 * Creating and cancelling are safe to widen — a missing dog and a cancelled
 * one are equally wrong at any distance. Field differences are the ones that
 * need a human to read them row by row, which is the real reason the window
 * was ever fourteen days.
 */
const untilArg = process.argv.indexOf("--until");
const WINDOW_END = untilArg !== -1 ? String(process.argv[untilArg + 1] ?? "").trim() : "2026-10-26";
if (!/^\d{4}-\d{2}-\d{2}$/.test(WINDOW_END)) { console.error("--until needs YYYY-MM-DD"); process.exit(1); }

const read = (path: string) => {
  const unzip = (entry: string, optional = false) => {
    try {
      return execFileSync("unzip", ["-p", path, entry], { maxBuffer: 4e8, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    } catch (e) { if (optional) return ""; throw e; }
  };
  return parseSheet(unzip("xl/worksheets/sheet1.xml"), parseSharedStrings(unzip("xl/sharedStrings.xml", true)));
};

const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const toIso = (d: string) => {
  const m = String(d ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
/** "09:30 AM" → minutes past midnight, Brisbane. */
const toMinutes = (t: string) => {
  const m = String(t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
};
/** Brisbane is UTC+10 with no DST, so the offset is a constant. */
const brisbaneToUtc = (iso: string, minutes: number) =>
  new Date(Date.parse(`${iso}T00:00:00+10:00`) + minutes * 60_000);

/**
 * Per-dog groomers for the multi-pet bookings, read from each client's own
 * MoeGo **Bookings → Upcoming** page on 12/10/2026.
 *
 * The export cannot give this. `Staffs` lists the DISTINCT people on a
 * booking, not one per pet, so position is a guess — and a wrong one: on
 * #129241895 position happens to get the first three dogs right and then has
 * nothing left for Teddie, and on #133330760 it hands Charlotte to Ginger
 * when Charlotte actually has Coco. See Trap 3 in the sync skill.
 *
 * Anything not listed here still falls through to the alignment guard and is
 * held back rather than guessed.
 */
const PER_DOG_STAFF: Record<string, Record<string, string>> = {
  // Desiree Mcconnon, 30/10
  "109597478": { olah: "Megan Graham", teddy: "Charlotte Purcell", eevee: "Megan Graham", georgi: "Charlotte Purcell" },
  // Alisa Luck, 28/10
  "129241895": { beau: "Charlotte Purcell", woody: "Megan Graham", dusty: "Brooklyn Cossey", teddie: "Charlotte Purcell" },
  // Marcelle Arkadieff, 27/10
  "127996790": { lilly: "Megan Graham", reggie: "Charlotte Purcell", ruby: "Charlotte Purcell" },
  // Vorn Reddell, 27/10
  "124166094": { charlie: "Charlotte Purcell", lola: "Megan Graham", ralph: "Megan Graham" },
  // Brook Davidson, 23/10
  "133330760": { pepsi: "Megan Graham", ginger: "Megan Graham", coco: "Charlotte Purcell" },
  // Joanne Sneeden, 21/10 — one dog; Brooklyn does only the teeth add-on,
  // and Groomigo has no column for an add-on's staff.
  "132401819": { chilli: "Zakaria Romari" },
};
/** The verified groomer for a dog, or null if nobody has checked this one. */
const verifiedStaff = (booking: string, pet: string) =>
  PER_DOG_STAFF[booking]?.[norm(pet)] ?? null;

const STAFF_ALIAS: Record<string, string> = { "megan graham": "megs graham", "bather 1": "steph" };
const staffKey = (n: string) => STAFF_ALIAS[norm(n)] ?? norm(n);

// ── Parse MoeGo ──────────────────────────────────────────────────────────────
const sRows = read(SCHED);
const sHead = sRows[0].map((h) => String(h ?? "").trim());
const sI = (n: string) => sHead.findIndex((h) => h.toLowerCase() === n.toLowerCase());
const COL = { booking: sI("Booking ID"), date: sI("Date"), time: sI("Time"), client: sI("Client ID"),
  first: sI("First name"), last: sI("Last name"), pets: sI("Pet name"),
  services: sI("Service & add ons"), staffs: sI("Staffs"), status: sI("Status") };

type Dog = { booking: string; iso: string; mins: number | null; who: string; pet: string;
  service: string; staff: string; alignmentOk: boolean };
const dogs: Dog[] = [];
for (const r of sRows.slice(1)) {
  const booking = String(r[COL.booking] ?? "").trim();
  if (!booking) continue;
  const pets = parseMoegoPets(String(r[COL.pets] ?? "")).map((p) => p.name).filter(Boolean);
  const services = String(r[COL.services] ?? "").split(",").map((s) => s.trim());
  const staffs = String(r[COL.staffs] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const alignmentOk = pets.length > 0 && (staffs.length === pets.length || staffs.length <= 1);
  pets.forEach((pet, i) => dogs.push({
    booking, iso: toIso(String(r[COL.date] ?? "")), mins: toMinutes(String(r[COL.time] ?? "")),
    who: `${String(r[COL.first] ?? "").trim()} ${String(r[COL.last] ?? "").trim()}`.trim(), pet,
    service: services[i] ?? services[0] ?? "",
    staff: staffs.length === 1 ? staffs[0] : (staffs[i] ?? ""), alignmentOk,
  }));
}
const inWindow = (iso: string) => iso >= TODAY && iso <= WINDOW_END;
const windowDogs = dogs.filter((d) => inWindow(d.iso));

(async () => {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });

  const [staffRows] = (await db.query(
    `SELECT id, name, role FROM staff WHERE tenant_id=? AND is_active=1`, [TENANT])) as any;
  const staffByKey = new Map<string, any>(staffRows.map((s: any) => [staffKey(s.name), s]));
  const resolveStaff = (moegoName: string) => staffByKey.get(staffKey(moegoName)) ?? null;

  const [gRows] = (await db.query(`
    SELECT a.id, a.moego_appointment_id AS booking, a.pet_id, a.client_id, a.staff_id,
           a.workflow_state, a.service_type,
           DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d,
           TIME_TO_SEC(TIME(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')))/60 mins,
           TIMESTAMPDIFF(MINUTE, a.scheduled_start, a.scheduled_end) dur,
           p.name pet, st.name staff_name
    FROM appointments a JOIN pets p ON p.id=a.pet_id
    LEFT JOIN staff st ON st.id=a.staff_id
    WHERE a.tenant_id=? AND DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')) BETWEEN ? AND ?`,
    [TENANT, TODAY, WINDOW_END])) as any;

  const key = (b: string, p: string) => `${b}|${norm(p)}`;
  const gByKey = new Map<string, any>();
  for (const g of gRows) if (g.booking) gByKey.set(key(String(g.booking), g.pet), g);

  type Plan = { sql: string; args: any[]; expect: number; why: string };
  const plan: Plan[] = [];
  const blocked: string[] = [];

  // ── 1. CANCELLATIONS (bucket 1) — the urgent one ───────────────────────────
  // A dog MoeGo has cancelled and Groomigo still shows as coming. Guarded on
  // `scheduled`: anything further along is on the salon floor and untouchable.
  const cRows = read(CANX);
  const cHead = cRows[0].map((h: string) => String(h ?? "").trim());
  const cI = (n: string) => cHead.findIndex((h: string) => h.toLowerCase() === n.toLowerCase());
  const cancelled = new Map<string, { on: string; why: string }>();
  for (const r of cRows.slice(1)) {
    const b = String(r[cI("Booking ID")] ?? "").trim();
    if (!b || !inWindow(toIso(String(r[cI("Date")] ?? "")))) continue;
    cancelled.set(b, { on: String(r[cI("Cancelled date")] ?? "").trim(), why: String(r[cI("Cancel reason")] ?? "").trim() });
  }
  for (const g of gRows) {
    if (!g.booking || g.workflow_state !== "scheduled") continue;
    const c = cancelled.get(String(g.booking));
    if (!c) continue;
    plan.push({
      why: `CANCEL ${g.pet} ${g.d} #${g.booking} — cancelled in MoeGo ${c.on}${c.why ? `, ${c.why}` : ""}`,
      sql: `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
            WHERE id=? AND workflow_state='scheduled'`,
      args: [g.id], expect: 1,
    });
    plan.push({
      why: `  └ workflow_logs scheduled→cancelled for appointment ${g.id}`,
      sql: `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes)
            VALUES (?, 'scheduled', 'cancelled', ?)`,
      args: [g.id, `MoeGo sync 12/10/2026: cancelled in MoeGo${c.why ? ` (${c.why})` : ""}`], expect: 1,
    });
  }

  // ── 2. CREATES — every in-window dog MoeGo has and Groomigo does not ───────
  // Derived from the export, not a hand-written list, so a booking accepted
  // between the pull and the run is picked up rather than missed. A dog whose
  // client or pet is not already on file is HELD BACK, never invented: a new
  // customer needs a real client record, not one guessed from a report row.
  for (const src of windowDogs) {
    if (gByKey.has(key(src.booking, src.pet))) continue;
    if (cancelled.has(src.booking)) continue;
    const label = `${src.pet} (${src.who}) ${src.iso}`;
    const verified = verifiedStaff(src.booking, src.pet);
    if (!src.alignmentOk && !verified) { blocked.push(`create ${label}: pet/staff counts disagree and nobody has read this booking in MoeGo (Trap 3)`); continue; }
    if (src.mins === null) { blocked.push(`create ${label}: unreadable time`); continue; }

    const [pets] = (await db.query(
      `SELECT p.id, p.client_id FROM pets p JOIN clients c ON c.id=p.client_id
       WHERE c.tenant_id=? AND LOWER(p.name)=LOWER(?) AND LOWER(CONCAT(c.first_name,' ',c.last_name))=LOWER(?)`,
      [TENANT, src.pet, src.who])) as any;
    if (pets.length !== 1) {
      blocked.push(`create ${label}: ${pets.length === 0 ? "client or pet not on file — needs a real client record first" : `${pets.length} matching pets — ambiguous`}`);
      continue;
    }
    const pet = pets[0];

    // Trap 5: already booked that day under ANY booking id or state?
    const [dupes] = (await db.query(
      `SELECT id FROM appointments WHERE pet_id=? AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))=?`,
      [pet.id, src.iso])) as any;
    if (dupes.length) { blocked.push(`create ${label}: already has ${dupes.length} row(s) that day`); continue; }

    // A verified per-dog groomer beats the export's booking-level list.
    const staffName = verified ?? src.staff;
    const member = resolveStaff(staffName);
    if (staffName && !member) { blocked.push(`create ${label}: unresolved groomer "${staffName}" (Trap 11)`); continue; }

    const dur = 60;
    const startAt = brisbaneToUtc(src.iso, src.mins);
    const endAt = new Date(startAt.getTime() + dur * 60_000);
    const svc = /styl/i.test(src.service) ? "styled_groom" : "classic_groom";
    plan.push({
      why: `CREATE ${label} ${src.mins}min-of-day, ${member?.name ?? "no groomer"}, ${dur}min, ${svc} #${src.booking}`,
      // price/gross_price NULL: MoeGo's total is per BOOKING, not per dog.
      sql: `INSERT INTO appointments
              (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start,
               scheduled_end, workflow_state, status, moego_appointment_id)
            VALUES (?,?,?,?,?,?,?, 'scheduled','pending', ?)`,
      args: [TENANT, pet.client_id, pet.id, member?.id ?? null, svc, startAt, endAt, src.booking],
      expect: 1,
    });
  }

  // ── 3. JERSEY — a DELETED MoeGo booking, which neither report shows ────────
  // Verified in MoeGo on 12/10/2026 from Pip Mainwaring's own Bookings tab:
  // Upcoming is #135713826 (05/11) and #135713948 (11/12); Cancelled is
  // #128699463 (09/09). #132858604 is in no tab at all, so it was deleted
  // rather than cancelled — invisible to the cancellations report. The two
  // replacements fall outside the pulled window and are NOT created here.
  const [[jersey]] = (await db.query(`
    SELECT a.id, a.workflow_state, DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d
    FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients c ON c.id=p.client_id
    WHERE a.moego_appointment_id='132858604' AND p.name='Jersey' AND c.last_name='Mainwaring'`)) as any;
  if (!jersey) blocked.push("Jersey: booking 132858604 no longer in Groomigo — nothing to do");
  else if (jersey.workflow_state !== "scheduled") blocked.push(`Jersey: state is ${jersey.workflow_state}, not scheduled — left alone`);
  else if (jersey.d !== "2026-10-21") blocked.push(`Jersey: sits on ${jersey.d}, expected 2026-10-21 — left alone`);
  else {
    plan.push({
      why: `CANCEL Jersey (Pip Mainwaring) 2026-10-21 — booking 132858604 deleted in MoeGo`,
      sql: `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
            WHERE id=? AND workflow_state='scheduled'`,
      args: [jersey.id], expect: 1,
    });
    plan.push({
      why: `  └ workflow_logs scheduled→cancelled for appointment ${jersey.id}`,
      sql: `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes)
            VALUES (?, 'scheduled', 'cancelled', 'MoeGo sync 12/10/2026: booking 132858604 deleted in MoeGo')`,
      args: [jersey.id], expect: 1,
    });
  }

  // ── 4. FIELD DIFFERENCES ───────────────────────────────────────────────────
  for (const d of windowDogs) {
    const g = gByKey.get(key(d.booking, d.pet));
    if (!g || g.workflow_state !== "scheduled") continue;
    const verifiedDiff = verifiedStaff(d.booking, d.pet);
    if (!d.alignmentOk && !verifiedDiff) { blocked.push(`${d.pet} #${d.booking}: pet/staff counts disagree and nobody has read this booking in MoeGo (Trap 3)`); continue; }

    const wantStaff = verifiedDiff ?? d.staff;
    if (wantStaff && g.staff_name && staffKey(g.staff_name) !== staffKey(wantStaff)) {
      const member = resolveStaff(wantStaff);
      if (!member) { blocked.push(`${d.pet} #${d.booking}: unresolved groomer "${wantStaff}" (Trap 11)`); continue; }
      plan.push({
        why: `STAFF ${d.pet} (${d.who}) ${d.iso}: ${g.staff_name} → ${member.name}`,
        sql: `UPDATE appointments SET staff_id=? WHERE id=? AND workflow_state='scheduled'`,
        args: [member.id, g.id], expect: 1,
      });
    }
    if (d.mins !== null && Number(g.mins) !== d.mins) {
      const start = brisbaneToUtc(d.iso, d.mins);
      const end = new Date(start.getTime() + Number(g.dur || 60) * 60_000);
      plan.push({
        why: `TIME ${d.pet} (${d.who}) ${d.iso}: ${g.mins}min → ${d.mins}min of day (duration ${g.dur}min kept)`,
        sql: `UPDATE appointments SET scheduled_start=?, scheduled_end=? WHERE id=? AND workflow_state='scheduled'`,
        args: [start, end, g.id], expect: 1,
      });
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`PLAN — ${plan.length} statement(s)${APPLY ? "" : "  (DRY RUN, nothing written)"}\n`);
  plan.forEach((p, i) => console.log(` ${String(i + 1).padStart(2)}. ${p.why}`));
  console.log(`\nHELD BACK — ${blocked.length}`);
  blocked.forEach((b) => console.log(`  · ${b}`));

  if (!APPLY) { console.log(`\nDRY RUN. Re-run with --apply to write.`); await db.end(); return; }

  await db.beginTransaction();
  try {
    for (const p of plan) {
      const [res] = (await db.execute(p.sql, p.args)) as any;
      const got = res.affectedRows ?? 0;
      if (got !== p.expect) throw new Error(`"${p.why}" affected ${got} rows, expected ${p.expect}`);
    }
    // Post-conditions, inside the transaction.
    const [[dbl]] = (await db.query(`
      SELECT COUNT(*) n FROM (
        SELECT pet_id, DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d, COUNT(*) c
        FROM appointments WHERE tenant_id=? AND workflow_state='scheduled'
          AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) BETWEEN ? AND ?
        GROUP BY pet_id, d HAVING c > 1) x`, [TENANT, TODAY, WINDOW_END])) as any;
    if (dbl.n > 0) throw new Error(`post-check: ${dbl.n} pet/date pair(s) booked twice`);

    await db.commit();
    console.log(`\nCOMMITTED ${plan.length} statement(s). No pet double-booked in the window.`);
  } catch (err: any) {
    await db.rollback();
    console.error(`\nROLLED BACK — nothing written. ${err.message}`);
    process.exitCode = 1;
  }
  await db.end();
})();

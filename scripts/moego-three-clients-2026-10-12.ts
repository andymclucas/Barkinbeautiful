/**
 * Bring Toni Constantini, Julie Noy and Holly Lucas fully across to Groomigo
 * before they go live on it alone.
 *
 *   node scripts/moego-three-clients-2026-10-12.ts "<schedules.xlsx>"
 *   node scripts/moego-three-clients-2026-10-12.ts "<schedules.xlsx>" --apply
 *
 * Scoped to these three MoeGo clients deliberately. The export covers the
 * whole book to 30/06/2027 and reconciling all of it is a much larger change
 * than anyone has reviewed; this touches nobody else's rows.
 *
 * It CREATES what MoeGo has and Groomigo does not. It never deletes and never
 * moves: Holly has rows that exist only in Groomigo, and whether those were
 * made deliberately is a question for a human, not a script.
 */
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";
import { parseMoegoPets } from "../shared/moegoImport.ts";
import { moegoStaffKey } from "../shared/moegoStaffAlias.ts";
dotenv.config({ quiet: true });

const SCHED = process.argv.find((a) => a.endsWith(".xlsx"));
const APPLY = process.argv.includes("--apply");
if (!SCHED) { console.error("need the schedules xlsx path"); process.exit(1); }

const TENANT = 1;
/** MoeGo client id → the Groomigo client it must land on. */
const CLIENTS: Record<string, { groomigoId: number; who: string }> = {
  "21095875": { groomigoId: 15, who: "Toni Constantini" },
  "21100746": { groomigoId: 19, who: "Julie Noy" },
  "21099478": { groomigoId: 258, who: "Holly Lucas" },
};

const read = (p: string) => {
  const u = (e: string, o = false) => {
    try { return execFileSync("unzip", ["-p", p, e], { maxBuffer: 4e8, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8"); }
    catch (err) { if (o) return ""; throw err; }
  };
  return parseSheet(u("xl/worksheets/sheet1.xml"), parseSharedStrings(u("xl/sharedStrings.xml", true)));
};
const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const toIso = (d: string) => {
  const m = String(d ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
const toMinutes = (t: string) => {
  const m = String(t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
};
/** Brisbane is UTC+10 all year. */
const brisbane = (iso: string, mins: number) =>
  new Date(Date.parse(`${iso}T00:00:00+10:00`) + mins * 60_000);

// The alias map lives in shared/moegoStaffAlias.ts. It used to be written
// out here and in moego-sync-2026-10-12.ts, and the two had drifted.

/**
 * Service type and length, from MoeGo's service text.
 *
 * The numbers are not invented: they are what the already-imported rows for
 * these same three clients use, so a created row is indistinguishable from
 * one that came across in the first migration.
 */
function deriveService(text: string): { serviceType: string; minutes: number } {
  if (/bath/i.test(text)) return { serviceType: "bath_only", minutes: 120 };
  if (/styl/i.test(text)) return { serviceType: "styled_groom", minutes: 90 };
  return { serviceType: "classic_groom", minutes: 60 };
}

const rows = read(SCHED);
const head = rows[0].map((h: string) => String(h ?? "").trim());
const I = (n: string) => head.findIndex((c: string) => c.toLowerCase() === n.toLowerCase());
const COL = { booking: I("Booking ID"), date: I("Date"), time: I("Time"), client: I("Client ID"),
  pets: I("Pet name"), services: I("Service & add ons"), staffs: I("Staffs"), status: I("Status") };

type Want = { booking: string; iso: string; mins: number; pet: string; service: string;
  staff: string; groomigoClientId: number; who: string; alignmentOk: boolean };
const wanted: Want[] = [];
for (const r of rows.slice(1)) {
  const moegoClient = String(r[COL.client] ?? "").trim();
  const target = CLIENTS[moegoClient];
  if (!target) continue;
  const booking = String(r[COL.booking] ?? "").trim();
  const iso = toIso(String(r[COL.date] ?? ""));
  const mins = toMinutes(String(r[COL.time] ?? ""));
  if (!booking || !iso || mins === null) continue;

  const pets = parseMoegoPets(String(r[COL.pets] ?? "")).map((p) => p.name).filter(Boolean);
  const services = String(r[COL.services] ?? "").split(",").map((s) => s.trim());
  const staffs = String(r[COL.staffs] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Staffs lists DISTINCT people, not one per pet (Trap 3). With one name it
  // covers every dog; with more, the service text still names the groomer in
  // "(by X)" on MoeGo's own page, which the export drops — so more than one
  // name on a multi-pet booking is held back rather than aligned by position.
  const alignmentOk = staffs.length <= 1 || staffs.length === pets.length;
  pets.forEach((pet, i) => wanted.push({
    booking, iso, mins, pet,
    service: services[i] ?? services[0] ?? "",
    staff: staffs.length === 1 ? staffs[0] : (staffs[i] ?? ""),
    groomigoClientId: target.groomigoId, who: target.who, alignmentOk,
  }));
}

(async () => {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z",
  });
  const [staffRows] = (await db.query(
    `SELECT id, name, tenant_id tenantId, is_active isActive, role FROM staff WHERE tenant_id=?`, [TENANT])) as any;
  const staffByKey = new Map<string, any>(staffRows.map((s: any) => [moegoStaffKey(s.name), s]));

  const [existing] = (await db.query(`
    SELECT a.id, a.moego_appointment_id b, p.name pet, p.client_id,
           DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d,
           TIME_TO_SEC(TIME(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')))/60 mins,
           a.workflow_state ws
    FROM appointments a JOIN pets p ON p.id=a.pet_id
    WHERE p.client_id IN (15,19,258) AND a.scheduled_start >= NOW()`)) as any;
  const haveByBookingPet = new Set(existing.filter((e: any) => e.b).map((e: any) => `${e.b}|${norm(e.pet)}`));
  const haveByPetDate = new Set(existing.map((e: any) => `${e.client_id}|${norm(e.pet)}|${e.d}`));

  const plan: { why: string; sql: string; args: any[] }[] = [];
  const blocked: string[] = [];

  for (const w of wanted) {
    if (haveByBookingPet.has(`${w.booking}|${norm(w.pet)}`)) continue;
    const label = `${w.pet} (${w.who}) ${w.iso} ${String(Math.floor(w.mins / 60)).padStart(2, "0")}:${String(w.mins % 60).padStart(2, "0")}`;
    if (!w.alignmentOk) { blocked.push(`${label} #${w.booking}: ${"pet/staff counts disagree (Trap 3)"}`); continue; }

    const [pets] = (await db.query(
      `SELECT id FROM pets WHERE client_id=? AND LOWER(name)=LOWER(?) LIMIT 2`,
      [w.groomigoClientId, w.pet])) as any;
    if (pets.length !== 1) {
      blocked.push(`${label}: ${pets.length === 0 ? `no pet named ${w.pet} on this client — never invent one` : "ambiguous pet name"}`);
      continue;
    }
    // Trap 5: already booked that day under any id or none?
    if (haveByPetDate.has(`${w.groomigoClientId}|${norm(w.pet)}|${w.iso}`)) {
      blocked.push(`${label}: already has a booking that day — left alone`);
      continue;
    }
    const member = staffByKey.get(moegoStaffKey(w.staff));
    if (w.staff && !member) { blocked.push(`${label}: unresolved groomer "${w.staff}" (Trap 11)`); continue; }
    // Tenant and active, checked directly. canAssignTo() next door answers a
    // different question — who returns phone calls — and borrowing it here
    // would tie a booking import to a messaging rule.
    if (member && (member.tenantId !== TENANT || member.isActive === 0 || member.isActive === false)) {
      blocked.push(`${label}: groomer "${w.staff}" is inactive or belongs to another salon`);
      continue;
    }

    const { serviceType, minutes } = deriveService(w.service);
    const start = brisbane(w.iso, w.mins);
    const end = new Date(start.getTime() + minutes * 60_000);
    plan.push({
      why: `CREATE ${label}  ${serviceType} ${minutes}min  ${member?.name ?? "(no groomer)"}  #${w.booking}`,
      // price/gross_price NULL: MoeGo's total is per booking, not per dog.
      sql: `INSERT INTO appointments
              (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start, scheduled_end,
               workflow_state, status, moego_appointment_id)
            VALUES (?,?,?,?,?,?,?, 'scheduled','pending', ?)`,
      args: [TENANT, w.groomigoClientId, pets[0].id, member?.id ?? null, serviceType, start, end, w.booking],
    });
  }

  // Rows Groomigo holds that MoeGo does not. Reported, never touched.
  const wantKeys = new Set(wanted.map((w) => `${w.booking}|${norm(w.pet)}`));
  const orphans = existing.filter((e: any) => !e.b || !wantKeys.has(`${e.b}|${norm(e.pet)}`));

  console.log(`PLAN — ${plan.length} create(s)${APPLY ? "" : "   (DRY RUN, nothing written)"}\n`);
  const byClient: Record<string, number> = {};
  plan.forEach((p) => { const m = p.why.match(/\(([^)]+)\)/); if (m) byClient[m[1]] = (byClient[m[1]] ?? 0) + 1; });
  Object.entries(byClient).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log();
  plan.slice(0, 8).forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.why}`));
  if (plan.length > 8) console.log(`  … and ${plan.length - 8} more`);

  console.log(`\nIN GROOMIGO, NOT IN MOEGO — reported only, nothing deleted: ${orphans.length}`);
  orphans.forEach((o: any) => console.log(`  ${o.d} ${String(Math.floor(o.mins / 60)).padStart(2, "0")}:${String(Math.round(o.mins % 60)).padStart(2, "0")}  ${o.pet}  client ${o.client_id}  #${o.b ?? "no booking id — created in Groomigo"}`));

  console.log(`\nHELD BACK: ${blocked.length}`);
  blocked.slice(0, 10).forEach((b) => console.log(`  · ${b}`));
  if (blocked.length > 10) console.log(`  … and ${blocked.length - 10} more`);

  if (!APPLY) { console.log(`\nDRY RUN. Re-run with --apply to write.`); await db.end(); return; }

  await db.beginTransaction();
  try {
    for (const p of plan) {
      const [res] = (await db.execute(p.sql, p.args)) as any;
      if ((res.affectedRows ?? 0) !== 1) throw new Error(`"${p.why}" affected ${res.affectedRows}`);
    }
    // Scoped to the rows this run created, on purpose. A tenant-wide check
    // fails on data that was already wrong before the script ran — Holly has
    // two Reggie rows on 10/12, made by hand long before this — and rolling
    // back 33 correct inserts because of someone else's old duplicate helps
    // nobody. The assertion that matters is "did I double-book a dog".
    const touched = plan.map((p) => p.args).map((a) => ({ petId: a[2] as number, start: a[5] as Date }));
    for (const t of touched) {
      const [[dbl]] = (await db.query(
        `SELECT COUNT(*) n FROM appointments
         WHERE pet_id=? AND workflow_state='scheduled'
           AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) = DATE(CONVERT_TZ(?,'+00:00','+10:00'))`,
        [t.petId, t.start])) as any;
      if (dbl.n > 1) throw new Error(`post-check: pet ${t.petId} now has ${dbl.n} bookings on ${t.start.toISOString().slice(0, 10)}`);
    }
    await db.commit();
    console.log(`\nCOMMITTED ${plan.length} appointment(s). No dog booked twice on a day.`);
  } catch (err: any) {
    await db.rollback();
    console.error(`\nROLLED BACK — nothing written. ${err.message}`);
    process.exitCode = 1;
  }
  await db.end();
})();

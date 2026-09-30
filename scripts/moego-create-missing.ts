/**
 * Create the appointments MoeGo has and Groomigo is missing.
 *
 *   node scripts/moego-create-missing.ts <plan.json>           # dry run
 *   node scripts/moego-create-missing.ts <plan.json> --apply   # write
 *
 * The plan comes from the reconciliation: MoeGo's appointment-list export
 * gives the dog, owner, service and staff, and the START TIME is scraped
 * from MoeGo's own Agenda view, because the export has only a date. Every
 * row in the plan was matched to exactly one calendar entry and resolved to
 * a Groomigo client, pet and staff id before it got here.
 *
 * ── Guards ────────────────────────────────────────────────────────────────
 *
 *  - Dry run by default. --apply is the only way to write.
 *  - One transaction; any surprise rolls the whole thing back.
 *  - Trap 5 is re-checked AT WRITE TIME, not trusted from the plan: if the
 *    dog has picked up a booking that day since the plan was made, the row is
 *    skipped. That is how two dogs got double-booked once already.
 *  - (moego_appointment_id, pet_id) is checked too, so a second run cannot
 *    duplicate. The id alone is not enough - one MoeGo booking covers several
 *    dogs, so Dottie and Bear share booking #124851389.
 *  - Times are written in UTC as strings. The column holds UTC (verified:
 *    "2026-10-05 21:30" reads back as Brisbane 07:30 on the 6th) and this
 *    machine runs Brisbane, so handing the driver a JS Date would invite a
 *    ten-hour error across every row.
 *  - Anything dated today or earlier is refused. Those appointments have
 *    already happened; putting them on the board as `scheduled` adds dogs to
 *    a day that is over.
 */
import fs from "node:fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { brisbaneDate } from "../shared/businessDays.ts";

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const PLAN = args.find((a) => !a.startsWith("--"));
const APPLY = args.includes("--apply");
if (!PLAN) { console.error("Usage: node scripts/moego-create-missing.ts <plan.json> [--apply]"); process.exit(1); }

interface PlanRow {
  bookingId: string; date: string; start: string; end: string;
  pet: string; client: string; petId: number; clientId: number;
  tenantId: number; staffId: number | null; service: string; issues: string[];
}
const plan: PlanRow[] = JSON.parse(fs.readFileSync(PLAN, "utf8"));
const today = brisbaneDate(new Date());

/** Brisbane wall-clock to the UTC string the column stores. No JS Date. */
function toUtcString(date: string, hhmm: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mi] = hhmm.split(":").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, hh - 10, mi, 0));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${p(utc.getUTCMonth() + 1)}-${p(utc.getUTCDate())} ${p(utc.getUTCHours())}:${p(utc.getUTCMinutes())}:00`;
}

const skipped: string[] = [];
const todo = plan.filter((r) => {
  if (r.issues?.length) { skipped.push(`${r.date} ${r.pet} (${r.client}) - ${r.issues.join("; ")}`); return false; }
  if (r.date <= today) { skipped.push(`${r.date} ${r.pet} (${r.client}) - today or earlier, already happened`); return false; }
  if (!r.petId || !r.clientId || !r.tenantId) { skipped.push(`${r.date} ${r.pet} - unresolved ids`); return false; }
  return true;
});

console.log(`Plan rows: ${plan.length}   to create: ${todo.length}   skipped: ${skipped.length}`);
skipped.forEach((s) => console.log(`  SKIP  ${s}`));
console.log(`\nMode: ${APPLY ? "APPLY" : "DRY RUN - writes nothing"}\n`);
for (const r of todo) {
  console.log(`  ${r.date} ${r.start}-${r.end}  ${r.pet} (${r.client})  ${r.service}  staff=${r.staffId ?? "unassigned"}  utc=${toUtcString(r.date, r.start)}`);
}

const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  dateStrings: true,
});

if (!APPLY) {
  console.log(`\nDry run. Nothing written. Re-run with --apply to create ${todo.length}.`);
  await db.end();
  process.exit(0);
}

await db.beginTransaction();
let created = 0;
const clashes: string[] = [];
try {
  for (const r of todo) {
    // Trap 5, re-checked now rather than trusted from the plan.
    const [existing] = await db.query<any[]>(
      `SELECT id FROM appointments
        WHERE pet_id = ? AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) = ?
          AND workflow_state NOT IN ('cancelled','no_show') FOR UPDATE`,
      [r.petId, r.date]);
    if (existing.length) { clashes.push(`${r.date} ${r.pet} - already has appt #${existing[0].id}`); continue; }

    // Idempotency, but only against a LIVE copy. When a client reschedules,
    // MoeGo keeps the booking id and moves the date: Groomigo then holds the
    // old instance, cancelled, on the old day. That must not block creating
    // the dog's new slot - but a live copy on another date is a genuine
    // disagreement between the two systems and a human has to pick.
    const [dupe] = await db.query<any[]>(
      `SELECT id, DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d
         FROM appointments
        WHERE moego_appointment_id = ? AND pet_id = ?
          AND workflow_state NOT IN ('cancelled','no_show') FOR UPDATE`,
      [r.bookingId, r.petId]);
    if (dupe.length) {
      clashes.push(`${r.date} ${r.pet} - Groomigo has this MoeGo booking LIVE on ${dupe[0].d} (appt #${dupe[0].id}); dates disagree, needs a human`);
      continue;
    }

    const [res] = await db.query<any>(
      `INSERT INTO appointments
         (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start, scheduled_end,
          workflow_state, status, moego_appointment_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'pending', ?, NOW(), NOW())`,
      [r.tenantId, r.clientId, r.petId, r.staffId, r.service,
       toUtcString(r.date, r.start), toUtcString(r.date, r.end), r.bookingId]);
    if (res.affectedRows !== 1) throw new Error(`insert for ${r.pet} on ${r.date} affected ${res.affectedRows} rows, expected 1`);
    created++;
    console.log(`  created #${res.insertId}  ${r.date} ${r.start}  ${r.pet} (${r.client})`);
  }
  await db.commit();
  console.log(`\nCommitted ${created} appointment(s).`);
} catch (err) {
  await db.rollback();
  console.error(`\nROLLED BACK - nothing written.\n${err instanceof Error ? err.message : String(err)}`);
  await db.end();
  process.exit(1);
}
if (clashes.length) {
  console.log(`\n${clashes.length} not created (a booking appeared since the plan was made):`);
  clashes.forEach((c) => console.log(`  ${c}`));
}
await db.end();

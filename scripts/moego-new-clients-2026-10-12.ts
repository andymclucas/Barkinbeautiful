/**
 * Create the three NEW clients Lauren accepted in MoeGo on 12/10/2026.
 *
 *   node scripts/moego-new-clients-2026-10-12.ts            # dry run
 *   node scripts/moego-new-clients-2026-10-12.ts --apply
 *
 * These were held back by the Monday sync because the sync must never invent
 * a client from a report row. Each one was first checked against Groomigo by
 * phone (Trap 10) and had no match, so all three are genuinely new.
 *
 * Client identity comes from MoeGo's schedules export; breed and weight come
 * from the online-booking request the customer filled in. Nothing here is
 * guessed — a missing field is left NULL.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { phoneMatchKey } from "../shared/moegoImport.ts";
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

const NEW = [
  { first: "Bec", last: "K", phone: "0416706519", email: "becjade83@hotmail.com",
    moegoClientId: "105920902", pet: "Biscuit", breed: "Miniature Poodle", weightKg: "3.00",
    booking: "136287088", iso: "2026-10-21", mins: 13 * 60 + 15, durMin: 60,
    staff: "Lauren Romari", service: "classic_groom" },
  { first: "Sarah", last: "Naylor", phone: "0452292067", email: "sarahnaylor87@gmail.com",
    moegoClientId: "105913549", pet: "Broods", breed: "Shetland Sheepdog", weightKg: "10.00",
    booking: "136228514", iso: "2026-10-16", mins: 13 * 60 + 15, durMin: 140,
    staff: "Zakaria Romari", service: "deshed" },
  { first: "Belinda", last: "Smith", phone: "0431512390", email: "breecolby@hotmail.com.au",
    moegoClientId: "105912198", pet: "Snowy", breed: "Maltese", weightKg: "10.00",
    booking: "136217697", iso: "2026-10-15", mins: 9 * 60 + 30, durMin: 60,
    staff: "Lauren Romari", service: "classic_groom" },
];

/** Brisbane is UTC+10 all year. */
const brisbaneToUtc = (iso: string, minutes: number) =>
  new Date(Date.parse(`${iso}T00:00:00+10:00`) + minutes * 60_000);

(async () => {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z",
  });

  const [staffRows] = (await db.query(
    `SELECT id, name FROM staff WHERE tenant_id=? AND is_active=1`, [TENANT])) as any;
  const staffByName = new Map<string, any>(staffRows.map((s: any) => [s.name.trim().toLowerCase(), s]));

  const [existing] = (await db.query(
    `SELECT id, first_name, last_name, phone, email, moego_client_id FROM clients WHERE tenant_id=?`, [TENANT])) as any;
  const byPhone = new Map<string, any>();
  const byMoego = new Map<string, any>();
  const byEmail = new Map<string, any>();
  for (const c of existing) {
    const k = phoneMatchKey(c.phone); if (k) byPhone.set(k, c);
    if (c.moego_client_id) byMoego.set(String(c.moego_client_id), c);
    if (c.email) byEmail.set(String(c.email).toLowerCase(), c);
  }

  const todo: any[] = [];
  const blocked: string[] = [];
  for (const n of NEW) {
    const who = `${n.first} ${n.last}`;
    // Trap 10, in the documented order: moego id, then phone, then email.
    const hit = byMoego.get(n.moegoClientId) ?? byPhone.get(phoneMatchKey(n.phone)) ?? byEmail.get(n.email.toLowerCase());
    if (hit) { blocked.push(`${who}: already exists as client ${hit.id} (${hit.first_name} ${hit.last_name}) — not creating a duplicate`); continue; }
    const member = staffByName.get(n.staff.toLowerCase());
    if (!member) { blocked.push(`${who}: groomer "${n.staff}" not found (Trap 11)`); continue; }
    const [clash] = (await db.query(
      `SELECT a.id FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients c ON c.id=p.client_id
       WHERE c.tenant_id=? AND LOWER(p.name)=LOWER(?) AND DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'))=?`,
      [TENANT, n.pet, n.iso])) as any;
    if (clash.length) { blocked.push(`${who}: a pet named ${n.pet} already has a booking on ${n.iso}`); continue; }
    todo.push({ ...n, staffId: member.id, staffName: member.name });
  }

  console.log(`PLAN — ${todo.length} client(s)${APPLY ? "" : "  (DRY RUN, nothing written)"}\n`);
  for (const t of todo) {
    console.log(`  ${t.first} ${t.last}  ${t.phone}  ${t.email}  (MoeGo ${t.moegoClientId})`);
    console.log(`    pet: ${t.pet} — ${t.breed}, ${t.weightKg}kg`);
    console.log(`    appt: ${t.iso} ${String(Math.floor(t.mins/60)).padStart(2,"0")}:${String(t.mins%60).padStart(2,"0")} for ${t.durMin}min with ${t.staffName}, ${t.service} #${t.booking}\n`);
  }
  if (blocked.length) { console.log(`HELD BACK — ${blocked.length}`); blocked.forEach((b) => console.log(`  · ${b}`)); }

  if (!APPLY) { console.log(`\nDRY RUN. Re-run with --apply to write.`); await db.end(); return; }

  await db.beginTransaction();
  try {
    let clients = 0, pets = 0, appts = 0;
    for (const t of todo) {
      const [c] = (await db.execute(
        `INSERT INTO clients (tenant_id, first_name, last_name, email, phone, status, moego_client_id)
         VALUES (?,?,?,?,?, 'active', ?)`,
        [TENANT, t.first, t.last, t.email, t.phone, t.moegoClientId])) as any;
      if (c.affectedRows !== 1) throw new Error(`client insert for ${t.first} affected ${c.affectedRows}`);
      const clientId = c.insertId; clients++;

      const [p] = (await db.execute(
        `INSERT INTO pets (tenant_id, client_id, name, species, breed, weight_kg)
         VALUES (?,?,?, 'dog', ?, ?)`,
        [TENANT, clientId, t.pet, t.breed, t.weightKg])) as any;
      if (p.affectedRows !== 1) throw new Error(`pet insert for ${t.pet} affected ${p.affectedRows}`);
      const petId = p.insertId; pets++;

      const start = brisbaneToUtc(t.iso, t.mins);
      const end = new Date(start.getTime() + t.durMin * 60_000);
      // price/gross_price NULL — MoeGo's figure is per booking, not per dog.
      const [a] = (await db.execute(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start, scheduled_end,
            workflow_state, status, moego_appointment_id)
         VALUES (?,?,?,?,?,?,?, 'scheduled','pending', ?)`,
        [TENANT, clientId, petId, t.staffId, t.service, start, end, t.booking])) as any;
      if (a.affectedRows !== 1) throw new Error(`appointment insert for ${t.pet} affected ${a.affectedRows}`);
      appts++;
    }
    if (clients !== todo.length || pets !== todo.length || appts !== todo.length) {
      throw new Error(`counts disagree: ${clients} clients, ${pets} pets, ${appts} appointments`);
    }
    const [[dbl]] = (await db.query(`
      SELECT COUNT(*) n FROM (
        SELECT pet_id, DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d, COUNT(*) c
        FROM appointments WHERE tenant_id=? AND workflow_state='scheduled'
          AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) BETWEEN '2026-10-12' AND '2026-10-26'
        GROUP BY pet_id, d HAVING c > 1) x`, [TENANT])) as any;
    if (dbl.n > 0) throw new Error(`post-check: ${dbl.n} pet/date pair(s) booked twice`);

    await db.commit();
    console.log(`\nCOMMITTED — ${clients} clients, ${pets} pets, ${appts} appointments. No pet double-booked.`);
  } catch (err: any) {
    await db.rollback();
    console.error(`\nROLLED BACK — nothing written. ${err.message}`);
    process.exitCode = 1;
  }
  await db.end();
})();

/**
 * Round two: the 18 dogs whose price became derivable once the booking
 * total was understood as the SUM across the dogs, not one dog's price.
 * Andy approved 29/10/2026. Same guards as round one.
 *
 *   tsx scripts/moego-missing-dogs-apply-round2.ts            # prints
 *   tsx scripts/moego-missing-dogs-apply-round2.ts --apply    # writes
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const APPLY = process.argv.includes("--apply");
const TENANT = 1;

function toUtc(dateISO: string, time12: string): string {
  const m = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`unparseable time: ${time12}`);
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  const d = new Date(`${dateISO}T${String(h).padStart(2, "0")}:${m[2]}:00Z`);
  d.setUTCHours(d.getUTCHours() - 10);           // Brisbane is UTC+10, no DST
  return d.toISOString().slice(0, 19).replace("T", " ");
}
const plus = (utc: string, mins: number) => {
  const d = new Date(utc.replace(" ", "T") + "Z");
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

const { out } = JSON.parse(fs.readFileSync(S + "/solved.json", "utf8"));

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  console.log(APPLY ? "=== APPLYING ===" : "=== DRY ===");
  await c.beginTransaction();
  let n = 0;
  try {
    for (const p of out) {
      const [clash] = await c.query<any[]>(
        `SELECT id, workflow_state FROM appointments
          WHERE pet_id = ? AND DATE(CONVERT_TZ(scheduled_start,"+00:00","+10:00")) = ?`,
        [p.petId, p.date]);
      if (clash.length) throw new Error(`${p.dog} on ${p.date} already has appointment ${clash[0].id} (${clash[0].workflow_state}) — aborting`);

      const start = toUtc(p.date, p.time);
      const notes = `Created from MoeGo booking ${p.booking} on 29/10/2026 — missing from the Groomigo board. Price: ${p.why}.`;
      if (APPLY) {
        const [res] = await c.query<any>(
          `INSERT INTO appointments
             (tenant_id, client_id, pet_id, staff_id, scheduled_start, scheduled_end,
              service_type, price, status, workflow_state, moego_appointment_id, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [TENANT, p.clientId, p.petId, p.staffId, start, plus(start, p.minutes), p.serviceType,
           p.newPrice, p.status === "Confirmed" ? "confirmed" : "pending", "scheduled", p.booking, notes]);
        if (res.affectedRows !== 1) throw new Error(`insert for ${p.dog} affected ${res.affectedRows} rows`);
      }
      n++;
      console.log(`  + ${p.date} ${p.time.padEnd(9)} ${p.dog.padEnd(9)} ${String(p.minutes).padStart(3)}m $${String(p.newPrice).padStart(7)}  ${p.why}`);
    }
    if (APPLY) { await c.commit(); console.log(`\nCOMMITTED: ${n} created`); }
    else { await c.rollback(); console.log(`\nrolled back (dry): would create ${n}`); }
  } catch (e: any) {
    await c.rollback();
    console.log(`\nROLLED BACK — nothing written. ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
})();

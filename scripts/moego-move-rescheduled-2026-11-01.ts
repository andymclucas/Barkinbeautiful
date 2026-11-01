/**
 * Move the five November dogs MoeGo has rescheduled and Groomigo still
 * shows on the old date.
 *
 * The November import keyed "already present" on (booking, pet) across
 * the whole window, which is right for not duplicating a dog but blind
 * to a booking that MOVED within the window: the stale row matched, so
 * the dog looked present and the new date was never created. These five
 * are the result — each is on the board on a day it is not coming, and
 * missing from the day it is.
 *
 * Found by comparing every live Groomigo row in the window against
 * MoeGo's own schedule on client and pet, rather than on booking id.
 *
 *   corepack pnpm exec tsx scripts/moego-move-rescheduled-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-move-rescheduled-2026-11-01.ts --apply
 *
 * MoeGo wins on scheduling facts, so the move is MoeGo's date and
 * MoeGo's per-pet times from its calendar. Each update asserts the
 * booking id, the date it is expected to be leaving and `scheduled`,
 * and the target day is checked for that pet first — a dog on the
 * floor is untouchable and a dog booked twice is the worst outcome
 * here.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

const MOVES = [
  { apptId: 1200641, booking: "127051237", who: "Ashley McGuire / Sadie",
    fromDay: "2026-11-17", day: "10/11", start: "08:00am", end: "09:30am", price: null },
  { apptId: 1200335, booking: "122671540", who: "Megan Duggan / Ellie",
    fromDay: "2026-11-18", day: "11/11", start: "08:30am", end: "10:00am", price: null },
  { apptId: 1200925, booking: "132402807", who: "Liz Thomas / Minnie",
    fromDay: "2026-11-26", day: "13/11", start: "09:30am", end: "10:30am", price: null },
  { apptId: 1200710, booking: "128806239", who: "Linda Paterson / Hurley",
    fromDay: "2026-11-19", day: "18/11", start: "09:00am", end: "10:00am", price: null },
  // Single-dog booking, so MoeGo's booking total IS this dog's price.
  { apptId: 1200133, booking: "106577255", who: "Annie McLeod / Tommy",
    fromDay: "2026-11-20", day: "25/11", start: "12:30pm", end: "01:30pm", price: "70.00" },
];

const isoDay = (dm: string) => { const [dd, mm] = dm.split("/"); return `2026-${mm}-${dd}`; };
function brisbane(dm: string, hhmm: string): string {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])m$/i);
  if (!m) throw new Error(`unreadable time "${hhmm}"`);
  let h = Number(m[1]) % 12; if (m[3].toLowerCase() === "p") h += 12;
  return new Date(`${isoDay(dm)}T${String(h).padStart(2, "0")}:${m[2]}:00+10:00`)
    .toISOString().slice(0, 19).replace("T", " ");
}

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  for (const m of MOVES) {
    const [[row]]: any = await c.query(
      `SELECT a.pet_id, a.price, a.workflow_state ws, p.name pet,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%d/%m %H:%i') now_at
         FROM appointments a JOIN pets p ON p.id=a.pet_id
        WHERE a.id=? AND a.tenant_id=? AND a.moego_appointment_id=?`, [m.apptId, TENANT, m.booking]);
    if (!row) throw new Error(`${m.who}: appt ${m.apptId} not found on booking ${m.booking}`);
    const [clash]: any = await c.query(
      `SELECT id FROM appointments WHERE tenant_id=? AND pet_id=? AND id<>?
         AND workflow_state NOT IN ('cancelled','no_show')
         AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= ?
         AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  DATE_ADD(?, INTERVAL 1 DAY)`,
      [TENANT, row.pet_id, m.apptId, isoDay(m.day), isoDay(m.day)]);
    console.log(`${m.who}: ${row.now_at} (${row.ws}, $${row.price}) -> ${m.day} ${m.start}-${m.end}` +
      `${m.price ? ` price $${row.price} -> $${m.price}` : ""}` +
      `${clash.length ? `   ** TARGET DAY ALREADY HAS appt ${clash[0].id} **` : ""}`);
    if (clash.length) throw new Error(`${m.who}: ${row.pet} is already booked on ${m.day}`);
  }

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const m of MOVES) {
      const [res]: any = await c.query(
        `UPDATE appointments SET scheduled_start=?, scheduled_end=?${m.price ? ", price=?" : ""}
          WHERE id=? AND tenant_id=? AND moego_appointment_id=? AND workflow_state='scheduled'
            AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))=?`,
        m.price
          ? [brisbane(m.day, m.start), brisbane(m.day, m.end), m.price, m.apptId, TENANT, m.booking, m.fromDay]
          : [brisbane(m.day, m.start), brisbane(m.day, m.end), m.apptId, TENANT, m.booking, m.fromDay]);
      if (res.affectedRows !== 1) throw new Error(`${m.who}: affected ${res.affectedRows}, expected 1`);
    }
    await c.commit();
    console.log(`\ncommitted — ${MOVES.length} moved`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();

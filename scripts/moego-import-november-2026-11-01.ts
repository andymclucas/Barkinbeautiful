/**
 * Create the rest of November's bookings Groomigo is missing.
 *
 * Andy, 01/11/2026: "Merge it and do the rest of November."
 * The Thursday/Friday import covered 5-6 Nov. This covers the twelve
 * trading days from 10 Nov to 27 Nov, where MoeGo has 410 dogs and
 * Groomigo had 269.
 *
 *   corepack pnpm exec tsx scripts/moego-import-november-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-import-november-2026-11-01.ts --apply
 *
 * ## Where each field comes from
 *
 * - START AND END are per PET from MoeGo's own calendar (week list
 *   view), never derived. Two dogs on one booking routinely run
 *   different lengths. A duration table was NOT used, and neither was
 *   Groomigo's own history: the 2 August bulk import wrote a flat 120
 *   minutes onto 14,193 of its 14,205 rows, so "what this dog usually
 *   takes" reads that default back rather than anything MoeGo booked.
 * - PRICE is the booking total where the booking has ONE dog, which
 *   makes the total that dog's price. Where it has several, it is the
 *   even split only when every dog is on the identical service and the
 *   total divides cleanly — arithmetic, not inference. Otherwise the
 *   dog is created with NO price. MoeGo's report has a per-service
 *   "Service charges" column but it renders empty; the figures only
 *   exist in the downloaded export. An unpriced dog is visible on the
 *   board and fixable at completion; a wrongly priced one is neither.
 * - SERVICE is mapped from MoeGo's service name, taken per pet only
 *   when the booking lists exactly one service per pet. Add-ons splice
 *   into that column inline (Trap 3), so any other count falls back to
 *   the booking's first service.
 * - GROOMER is set only where the booking names exactly one person.
 *   `Staffs` is the list of DISTINCT people on a booking and is not
 *   aligned with the pets, so on anything ambiguous the dog arrives
 *   unassigned — visible and fixable, rather than assigned to the wrong
 *   groomer, which is not.
 *
 * ## Guards
 *
 * - The key is (booking, PET), never the booking. One MoeGo row is
 *   several appointments here, and keying on the booking alone skipped
 *   four dogs on the last run because a sibling was already present.
 * - Nothing is created for a pet that already has an appointment that
 *   Brisbane day under ANY booking id, re-checked inside the
 *   transaction. Duplicating a dog on a live board is the worst
 *   outcome here; staff work from it.
 * - No client and no pet is created. Five genuinely new MoeGo clients
 *   are reported instead, for Lauren to add through the app's own flow
 *   where breed and weight get captured.
 * - Two bookings MoeGo has rescheduled are MOVED, not duplicated
 *   (Trap 5), each guarded on the date it is expected to be leaving.
 * - One transaction. Any surprise rolls the lot back.
 *
 * Nothing is sent: a direct write runs no application code, so no
 * reminder is enqueued, and SMS_AUTOMATION_ENABLED is false here.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const DIR = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";

const STAFF: Record<string, number> = {
  "zakaria romari": 4, "megan graham": 2, "megs graham": 2,
  "brooklyn cossey": 5, "charlotte purcell": 3, "ashleigh knight": 6,
  "bather 1": 7, "bather": 7, "stephanie baldwin": 7,
};

/**
 * MoeGo moved these two after Groomigo's copy was made. The booking id
 * is unchanged, so creating would give one (booking, pet) two rows and
 * break the key the whole sync matches on. `fromDay` is asserted before
 * the move so a row that has shifted again since is left alone.
 */
const MOVES = [
  { apptId: 1200913, booking: "132240190", who: "Arina & Stan Marchenko / Peggy",
    fromDay: "2026-12-01", day: "17/11", start: "07:30am", end: "09:00am", price: "195.00" },
  { apptId: 1230090, booking: "133959294", who: "Cheryl Smith / Murphy",
    fromDay: "2026-11-05", day: "10/11", start: "11:30am", end: "12:30pm", price: null },
];

/**
 * Already on the board with the right dogs, times and per-dog prices
 * (125 + 163 = the 288 MoeGo shows), but created in Groomigo, so
 * carrying no booking id. Stamping it stops every future sync
 * reporting these two as missing.
 */
const BACKFILL = [
  { apptId: 2130005, booking: "136423796", who: "Kim Dahl / Beau" },
  { apptId: 2130006, booking: "136423796", who: "Kim Dahl / Ralph" },
];

/**
 * Things MoeGo splices into the service column that are NOT a dog's
 * service. They are what breaks positional alignment (Trap 3): a
 * two-pet booking reading "Full Groom, Nail Clipping" has two parts
 * and two pets and looks aligned, but the second dog is not having a
 * nail trim instead of a groom — one dog is having its nails done as
 * well. Stripping these first is what makes the remaining list line up
 * with the pets, because MoeGo lists each dog's service followed by
 * that dog's own add-ons.
 */
const ADD_ON = /teeth|anal gland|nail (clipping|painting)|extra care|day\s?care add on|pick up or delivery|asap surcharge|styled groom extra/i;

function serviceType(name: string): string {
  const s = name.toLowerCase();
  if (/day\s?care/.test(s)) return "daycare";
  if (/de-?shed/.test(s)) return "deshed";
  if (/^tidy/.test(s)) return "fft";
  if (/style/.test(s)) return "styled_groom";
  if (/bath/.test(s)) return "bath_only";
  if (/full groom|f groom service|groom/.test(s)) return "classic_groom";
  if (/nail/.test(s)) return "nail_trim";
  return "other";
}

const isoDay = (dm: string) => { const [dd, mm] = dm.split("/"); return `2026-${mm}-${dd}`; };
/** "09:30am" on a Brisbane day -> the UTC instant the column stores. */
function brisbane(dm: string, hhmm: string): string {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])m$/i);
  if (!m) throw new Error(`unreadable time "${hhmm}"`);
  let h = Number(m[1]) % 12; if (m[3].toLowerCase() === "p") h += 12;
  const d = new Date(`${isoDay(dm)}T${String(h).padStart(2, "0")}:${m[2]}:00+10:00`);
  return d.toISOString().slice(0, 19).replace("T", " ");
}
const mins = (hhmm: string) => { const m = hhmm.match(/^(\d{1,2}):(\d{2})\s*([ap])m$/i)!;
  return ((Number(m[1]) % 12) + (m[3].toLowerCase() === "p" ? 12 : 0)) * 60 + Number(m[2]); };

(async () => {
  const bookings = readFileSync(`${DIR}/nov-rows.txt`, "utf8").trim().split("\n").map((l) => {
    const c = l.split("|");
    return {
      booking: c[0], date: c[1], time: c[2], moegoClientId: c[3], client: c[4],
      pets: c[5].split(",").map((s) => s.trim()).filter(Boolean),
      services: c[6].split(",").map((s) => s.trim()).filter(Boolean),
      total: c[7].replace(/[^0-9.]/g, ""),
      staffs: c[8].split(",").map((s) => s.trim()).filter(Boolean),
      status: c[9],
    };
  });

  // Keep the LONGEST slot per pet: a dog can carry a second short row
  // for a pick-up or delivery leg, and the groom is the one that matters.
  const slots = new Map<string, { start: string; end: string }>();
  for (const l of readFileSync(`${DIR}/nov-slots.txt`, "utf8").trim().split("\n")) {
    const [day, start, end, client, pet] = l.split("|");
    if (client === "Block time") continue;
    const k = `${day}|${client}|${pet}`;
    const prev = slots.get(k);
    if (prev && mins(prev.end) - mins(prev.start) >= mins(end) - mins(start)) continue;
    slots.set(k, { start, end });
  }

  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const plan: any[] = [];
  const skipped: string[] = [];
  const noPrice: string[] = [];
  const noSlot: string[] = [];

  for (const b of bookings) {
    const [byId]: any = await c.query(
      `SELECT id FROM clients WHERE tenant_id=? AND moego_client_id=?`, [TENANT, b.moegoClientId]);
    const [byName]: any = await c.query(
      `SELECT id FROM clients WHERE tenant_id=? AND CONCAT(first_name,' ',last_name)=?`, [TENANT, b.client]);
    const clientId = byId[0]?.id ?? (byName.length === 1 ? byName[0].id : null);
    if (!clientId) { skipped.push(`NEW CLIENT  ${b.date} ${b.client} (moego ${b.moegoClientId}) — booking ${b.booking}, pets ${b.pets.join(", ")}`); continue; }

    const real = b.services.filter((x) => !ADD_ON.test(x));
    /* "Styled Groom EXTRA" is an upcharge that turns a classic groom
       into a styled one, so it is an add-on for alignment but it does
       change what the dog is having done. */
    const styledExtra = b.services.some((x) => /styled groom extra/i.test(x));
    const onePerPet = real.length === b.pets.length;
    /* An even split is only safe when the dogs are indistinguishable on
       this booking, because then the order of the service column cannot
       matter. That is true two ways: every dog on the identical single
       service, or a service list that divides into one identical SET
       per dog — Catherine Hindley's two dogs both take a groom, a teeth
       brushing and a day care, listed in different orders. */
    const n = b.pets.length;
    const identical = (() => {
      if (b.services.length % n !== 0) return false;
      const per = b.services.length / n;
      const key = (a: string[]) => [...a].sort().join("\u0000");
      const first = key(b.services.slice(0, per));
      for (let g = 1; g < n; g++) if (key(b.services.slice(g * per, (g + 1) * per)) !== first) return false;
      return true;
    })();
    const even = Number(b.total) / n;
    const evenOk = identical && Math.abs(even * 100 - Math.round(even * 100)) < 1e-6;
    /* A booking total of nothing cannot hide a non-zero dog: every
       price on it is zero. These are membership grooms, where no price
       is the correct figure rather than a missing one. */
    const allFree = Number(b.total) === 0;

    for (let i = 0; i < b.pets.length; i++) {
      const petName = b.pets[i];
      const [pets]: any = await c.query(
        `SELECT id FROM pets WHERE tenant_id=? AND client_id=? AND name=? AND status='active'`,
        [TENANT, clientId, petName]);
      if (pets.length !== 1) { skipped.push(`PET         ${b.date} ${b.client} — "${petName}" matched ${pets.length} active pets`); continue; }
      const petId = pets[0].id;
      const day = isoDay(b.date);

      const [already]: any = await c.query(
        `SELECT id FROM appointments WHERE tenant_id=? AND moego_appointment_id=? AND pet_id=?`,
        [TENANT, b.booking, petId]);
      if (already.length) continue;

      const [clash]: any = await c.query(
        `SELECT id FROM appointments WHERE tenant_id=? AND pet_id=?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= ?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  DATE_ADD(?, INTERVAL 1 DAY)`,
        [TENANT, petId, day, day]);
      if (clash.length) { skipped.push(`SAME DAY    ${b.date} ${b.client} — "${petName}" already booked (appt ${clash[0].id})`); continue; }

      let slot = slots.get(`${b.date}|${b.client}|${petName}`);
      if (!slot) {
        // The booking's own drop-off time, an hour long. Every multi-pet
        // booking checked starts all its dogs together, so the start is
        // right; only the length is a guess, and it is flagged.
        const t = b.time.replace(/^(\d{1,2})(AM|PM)$/i, "$1:00$2").replace(/(AM|PM)$/i, (x) => x.toLowerCase());
        const e = mins(t) + 60;
        slot = { start: t, end: `${String(Math.floor(e / 60) % 12 || 12).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}${e >= 720 ? "pm" : "am"}` };
        noSlot.push(`${b.date} ${b.client} / ${petName} — no calendar row, using ${slot.start} + 60min`);
      }

      const svcName = onePerPet ? real[i] : (real[0] ?? b.services[0]);
      let svc = serviceType(svcName);
      if (styledExtra && svc === "classic_groom") svc = "styled_groom";

      const price = b.pets.length === 1 ? Number(b.total).toFixed(2)
        : allFree ? "0.00"
        : evenOk ? even.toFixed(2)
        : null;
      if (price === null) noPrice.push(`${b.date} #${b.booking} ${b.client} / ${petName} — booking total $${b.total} across ${b.pets.length} dogs on different services`);

      const staffName = b.staffs.length === 1 ? b.staffs[0].toLowerCase() : null;
      const staffId = staffName ? STAFF[staffName] ?? null : null;

      plan.push({
        booking: b.booking, clientId, petId, petName, client: b.client,
        serviceType: svc, price, brisDay: day,
        start: brisbane(b.date, slot.start), end: brisbane(b.date, slot.end),
        staffId, status: /^C/i.test(b.status) ? "confirmed" : "pending",
        show: `${b.date} ${slot.start}-${slot.end}  ${b.client} — ${petName}  ${svc}  ${price ? "$" + price : "NO PRICE"}  ${staffId ? `staff ${staffId}` : "unassigned"}`,
      });
    }
  }

  console.log(`=== WOULD CREATE: ${plan.length} dogs ===`);
  plan.forEach((p) => console.log("  " + p.show));
  console.log(`\n=== SKIPPED: ${skipped.length} ===`);
  skipped.forEach((s) => console.log("  " + s));
  console.log(`\n=== NO CALENDAR ROW (start right, length guessed): ${noSlot.length} ===`);
  noSlot.forEach((s) => console.log("  " + s));
  console.log(`\n=== CREATED WITHOUT A PRICE: ${noPrice.length} ===`);
  noPrice.forEach((s) => console.log("  " + s));
  console.log(`\n=== MOVES: ${MOVES.length} ===`);
  MOVES.forEach((m) => console.log(`  appt ${m.apptId}  ${m.who}  ${m.fromDay} -> ${m.day} ${m.start}-${m.end}${m.price ? `  price -> $${m.price}` : ""}`));
  console.log(`=== BOOKING-ID BACKFILL: ${BACKFILL.length} ===`);
  BACKFILL.forEach((b) => console.log(`  appt ${b.apptId}  ${b.who}  -> ${b.booking}`));

  const byDay: Record<string, number> = {};
  plan.forEach((p) => { byDay[p.brisDay] = (byDay[p.brisDay] ?? 0) + 1; });
  console.log("\nnew dogs per day:", JSON.stringify(byDay, null, 0));

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const p of plan) {
      const [clash]: any = await c.query(
        `SELECT id FROM appointments WHERE tenant_id=? AND pet_id=?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= ?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  DATE_ADD(?, INTERVAL 1 DAY)`,
        [TENANT, p.petId, p.brisDay, p.brisDay]);
      if (clash.length) throw new Error(`${p.petName} was booked on ${p.brisDay} while this ran (appt ${clash[0].id})`);

      const [res]: any = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, price,
            scheduled_start, scheduled_end, workflow_state, status,
            moego_appointment_id, notes)
         VALUES (?,?,?,?,?,?,?,?, 'scheduled', ?, ?, ?)`,
        [TENANT, p.clientId, p.petId, p.staffId, p.serviceType, p.price,
         p.start, p.end, p.status, p.booking,
         "Created from MoeGo by the November sync on 01/11/2026."]);
      if (res.affectedRows !== 1) throw new Error(`${p.petName}: insert affected ${res.affectedRows}`);
    }

    for (const m of MOVES) {
      const [res]: any = await c.query(
        `UPDATE appointments SET scheduled_start=?, scheduled_end=?${m.price ? ", price=?" : ""}
          WHERE id=? AND tenant_id=? AND moego_appointment_id=? AND workflow_state='scheduled'
            AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))=?`,
        m.price
          ? [brisbane(m.day, m.start), brisbane(m.day, m.end), m.price, m.apptId, TENANT, m.booking, m.fromDay]
          : [brisbane(m.day, m.start), brisbane(m.day, m.end), m.apptId, TENANT, m.booking, m.fromDay]);
      if (res.affectedRows !== 1) throw new Error(`move ${m.who}: affected ${res.affectedRows}, expected 1`);
    }

    for (const b of BACKFILL) {
      const [res]: any = await c.query(
        `UPDATE appointments SET moego_appointment_id=?
          WHERE id=? AND tenant_id=? AND moego_appointment_id IS NULL AND workflow_state='scheduled'`,
        [b.booking, b.apptId, TENANT]);
      if (res.affectedRows !== 1) throw new Error(`backfill ${b.who}: affected ${res.affectedRows}, expected 1`);
    }

    await c.commit();
    console.log(`\ncommitted — ${plan.length} created, ${MOVES.length} moved, ${BACKFILL.length} stamped`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  const [after]: any = await c.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%a %d/%m') day,
            COUNT(*) dogs, SUM(price IS NULL) unpriced, SUM(staff_id IS NULL) unassigned
       FROM appointments
      WHERE tenant_id=? AND status NOT IN ('cancelled','no_show')
        AND workflow_state NOT IN ('cancelled','no_show')
        AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= '2026-11-09'
        AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  '2026-11-28'
      GROUP BY day ORDER BY MIN(scheduled_start)`, [TENANT]);
  console.table(after);
  await c.end();
})();

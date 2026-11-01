/**
 * Create the Thursday 5 / Friday 6 November bookings Groomigo is missing.
 *
 * Andy, 01/11/2026: "Import the missing Thursday and Friday bookings."
 * The Monday sync found the board showing 13 dogs against MoeGo's 24 on
 * the Thursday and 18 against 33 on the Friday.
 *
 *   corepack pnpm exec tsx scripts/moego-import-thu-fri-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-import-thu-fri-2026-11-01.ts --apply
 *
 * ## Where each field comes from — nothing is inferred from another dog
 *
 * - START AND END come from MoeGo's calendar, per PET, not from the
 *   booking. Two dogs on one booking can have different lengths, and
 *   they do: Allyson Warner's Bear runs 90 minutes beside two 60s.
 *   The salon's own duration table was NOT used — it says 60 minutes for
 *   a small dog and MoeGo books small styled grooms at 90.
 * - PRICE is the booking total for a single-dog booking, which is the
 *   dog's price. The one multi-dog booking here had its two prices read
 *   off the booking panel directly ($110 and $55, totalling the $165 the
 *   report shows).
 * - SERVICE is mapped from MoeGo's service name.
 * - GROOMER is only set where the booking names exactly one person, or
 *   where the panel was read per dog. `Staffs` is the list of DISTINCT
 *   people on a booking and is NOT aligned with the pets — Trap 3 — so
 *   on anything ambiguous the dog arrives unassigned, which is visible
 *   and fixable, rather than assigned to the wrong groomer, which is not.
 *
 * ## Guards
 *
 * - Nothing is created for a booking id already in Groomigo, searched
 *   across ALL dates rather than this window (Trap 5: a booking
 *   rescheduled out of range looked missing and was not).
 * - Nothing is created for a pet that already has an appointment that
 *   day under ANY booking id. Duplicating a dog on a live board is the
 *   worst outcome here; staff work from it.
 * - The client is matched on MoeGo id, then phone, then exact name, and
 *   the pet by name within that client. No client or pet is created.
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
 * Per-dog figures read off each booking's own panel in MoeGo.
 *
 * Needed wherever a booking has more than one dog, because the report
 * gives a booking TOTAL and the per-dog split cannot be recovered from
 * it. Each set adds up to the total the report shows — 110+55=165,
 * 88+145+88=321, 140+110=250, 110+88=198 — which is the check that the
 * reading is right.
 */
const PER_DOG: Record<string, { price: string; staff: string }> = {
  "134729977|Zoe": { price: "110.00", staff: "brooklyn cossey" },
  "134729977|Luna": { price: "55.00", staff: "bather" },
  "124851529|Stanley": { price: "88.00", staff: "megan graham" },
  "124851529|Bear": { price: "145.00", staff: "zakaria romari" },
  "124851529|Dottie": { price: "88.00", staff: "charlotte purcell" },
  "133332440|Margaret": { price: "140.00", staff: "brooklyn cossey" },
  "133332440|Bob": { price: "110.00", staff: "brooklyn cossey" },
  "130241800|Daisy": { price: "110.00", staff: "megan graham" },
  "130241800|Alvin": { price: "88.00", staff: "brooklyn cossey" },
};

function serviceType(name: string): string | null {
  const s = name.toLowerCase();
  if (/style full groom/.test(s)) return "styled_groom";
  if (/full groom|f groom service/.test(s)) return "classic_groom";
  if (/^tidy/.test(s)) return "fft";
  if (/de-?shed/.test(s)) return "deshed";
  if (/bath/.test(s)) return "bath_only";
  if (/nail/.test(s)) return "nail_trim";
  return null;
}

const digits = (s: string) => String(s ?? "").replace(/\D/g, "").replace(/^61/, "0");
const isoDay = (d: string) => { const [dd, mm, yy] = d.split("/"); return `${yy}-${mm}-${dd}`; };
/** "09:30 am" on a Brisbane day -> the UTC instant the column stores. */
function brisbane(day: string, hhmm: string): string {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])m$/i);
  if (!m) throw new Error(`unreadable time "${hhmm}"`);
  let h = Number(m[1]) % 12; if (m[3].toLowerCase() === "p") h += 12;
  const d = new Date(`${isoDay(day)}T${String(h).padStart(2, "0")}:${m[2]}:00+10:00`);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type Booking = {
  booking: string; date: string; moegoClientId: string; client: string; phone: string;
  pets: string[]; services: string[]; total: string; staffs: string[]; status: string;
};

(async () => {
  const bookings: Booking[] = readFileSync(`${DIR}/moego-thu-fri.txt`, "utf8").trim().split("\n").map((l) => {
    const c = l.split("|");
    return {
      booking: c[0], date: c[1], moegoClientId: c[3], client: c[4], phone: c[5],
      pets: c[6].split(",").map((s) => s.trim()).filter(Boolean),
      services: c[7].split(",").map((s) => s.trim()).filter(Boolean),
      total: c[9].replace(/[^0-9.]/g, ""), staffs: c[10].split(",").map((s) => s.trim()).filter(Boolean),
      status: c[11],
    };
  });

  const slots = new Map<string, { start: string; end: string }>();
  for (const l of readFileSync(`${DIR}/moego-slots.txt`, "utf8").trim().split("\n")) {
    const [day, start, end, client, pet] = l.split("|");
    slots.set(`${day}|${client}|${pet}`, { start, end });
  }

  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const plan: any[] = [];
  const skipped: string[] = [];

  for (const b of bookings) {
    /* Deliberately NOT a booking-level skip. The first run of this
       script checked `moego_appointment_id` alone and skipped the whole
       booking when ANY dog on it was already present — which left Bear,
       Dottie, Margaret and Alvin off the board, because a sibling was
       there. The key is (booking, PET), never the booking: that is Trap
       2, and one row in MoeGo is several appointments here.
       The per-pet checks below do the work. */

    const [byId]: any = await c.query(`SELECT id FROM clients WHERE tenant_id=? AND moego_client_id=?`, [TENANT, b.moegoClientId]);
    const [byPhone]: any = await c.query(
      `SELECT id FROM clients WHERE tenant_id=? AND REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') LIKE ?`,
      [TENANT, `%${digits(b.phone).slice(-9)}%`]);
    const [byName]: any = await c.query(
      `SELECT id FROM clients WHERE tenant_id=? AND CONCAT(first_name,' ',last_name)=?`, [TENANT, b.client]);
    const clientId = byId[0]?.id ?? byPhone[0]?.id ?? byName[0]?.id ?? null;
    if (!clientId) { skipped.push(`${b.date} ${b.client} — no such client in Groomigo (booking ${b.booking})`); continue; }

    const onePerPet = b.services.length === b.pets.length;
    for (let i = 0; i < b.pets.length; i++) {
      const petName = b.pets[i];
      const [pets]: any = await c.query(
        `SELECT id, weight_kg FROM pets WHERE tenant_id=? AND client_id=? AND name=? AND status='active'`,
        [TENANT, clientId, petName]);
      if (pets.length !== 1) { skipped.push(`${b.date} ${b.client} — "${petName}" matched ${pets.length} pets`); continue; }

      const day = isoDay(b.date);
      // This booking AND this pet already here, on any date.
      const [already]: any = await c.query(
        `SELECT id FROM appointments WHERE tenant_id=? AND moego_appointment_id=? AND pet_id=?`,
        [TENANT, b.booking, pets[0].id]);
      if (already.length) continue;

      const [clash]: any = await c.query(
        `SELECT id FROM appointments WHERE tenant_id=? AND pet_id=?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= ?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  DATE_ADD(?, INTERVAL 1 DAY)`,
        [TENANT, pets[0].id, day, day]);
      if (clash.length) { skipped.push(`${b.date} ${b.client} — "${petName}" already booked that day (appt ${clash[0].id})`); continue; }

      const slot = slots.get(`${b.date}|${b.client}|${petName}`);
      if (!slot) { skipped.push(`${b.date} ${b.client} — no calendar slot for "${petName}"`); continue; }

      const svcName = onePerPet ? b.services[i] : b.services[0];
      const svc = serviceType(svcName);
      if (!svc) { skipped.push(`${b.date} ${b.client} — "${petName}": cannot map service "${svcName}"`); continue; }

      const override = PER_DOG[`${b.booking}|${petName}`];
      const price = override ? override.price
        : b.pets.length === 1 ? Number(b.total).toFixed(2)
        : null;
      if (price === null) { skipped.push(`${b.date} ${b.client} — "${petName}": per-dog price not derivable`); continue; }

      const staffName = override ? override.staff
        : b.staffs.length === 1 ? b.staffs[0].toLowerCase()
        : null;
      const staffId = staffName ? STAFF[staffName] ?? null : null;

      plan.push({
        booking: b.booking, clientId, petId: pets[0].id, petName, client: b.client,
        serviceType: svc, price,
        /* The BRISBANE day, carried explicitly. scheduled_start is stored
           in UTC, so slicing its date gives the day before for anything
           before 10am — which would have pointed the duplicate re-check
           at the wrong day and quietly disarmed it. */
        brisDay: day,
        start: brisbane(b.date, slot.start), end: brisbane(b.date, slot.end),
        staffId, status: /confirmed/i.test(b.status) ? "confirmed" : "pending",
        show: `${b.date} ${slot.start}-${slot.end}  ${b.client} — ${petName}  ${svc}  $${price}  ${staffId ? `staff ${staffId}` : "UNASSIGNED"}`,
      });
    }
  }

  console.log(`=== WOULD CREATE: ${plan.length} dogs ===`);
  plan.forEach((p) => console.log("  " + p.show));
  console.log(`\n=== SKIPPED: ${skipped.length} ===`);
  skipped.forEach((s) => console.log("  " + s));

  const byDay: Record<string, number> = {};
  plan.forEach((p) => { byDay[p.brisDay] = (byDay[p.brisDay] ?? 0) + 1; });
  console.log("\nnew dogs per day:", JSON.stringify(byDay));

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const p of plan) {
      // Re-check the clash inside the transaction: the dry run was read
      // earlier and somebody may have booked the dog since.
      const [clash]: any = await c.query(
        `SELECT id FROM appointments WHERE tenant_id=? AND pet_id=?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= ?
           AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  DATE_ADD(?, INTERVAL 1 DAY)`,
        [TENANT, p.petId, p.brisDay, p.brisDay]);
      if (clash.length) throw new Error(`${p.petName} was booked that day while this ran (appt ${clash[0].id})`);

      const [res]: any = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, price,
            scheduled_start, scheduled_end, workflow_state, status,
            moego_appointment_id, notes)
         VALUES (?,?,?,?,?,?,?,?, 'scheduled', ?, ?, ?)`,
        [TENANT, p.clientId, p.petId, p.staffId, p.serviceType, p.price,
         p.start, p.end, p.status, p.booking,
         "Created from MoeGo by the sync on 01/11/2026."]);
      if (res.affectedRows !== 1) throw new Error(`${p.petName}: insert affected ${res.affectedRows}`);
    }
    await c.commit();
    console.log(`\ncommitted — ${plan.length} created`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  const [after]: any = await c.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%a %d/%m') day,
            COUNT(*) dogs, ROUND(SUM(COALESCE(price,0)),2) billable
       FROM appointments
      WHERE tenant_id=? AND status NOT IN ('cancelled','no_show')
        AND workflow_state NOT IN ('cancelled','no_show')
        AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') >= '2026-11-05'
        AND CONVERT_TZ(scheduled_start,'+00:00','+10:00') <  '2026-11-07'
      GROUP BY day ORDER BY MIN(scheduled_start)`, [TENANT]);
  console.table(after);
  await c.end();
})();

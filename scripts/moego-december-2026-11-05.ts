/**
 * Create the December bookings MoeGo has and the Groomigo board does not.
 *
 * Andy, 05/11/2026: "Do the cancellations and creates, then retail."
 *
 *   corepack pnpm exec tsx scripts/moego-december-2026-11-05.ts <file>
 *   corepack pnpm exec tsx scripts/moego-december-2026-11-05.ts <file> --apply
 *
 * Pulled fresh from MoeGo's Appointment schedules report (01-31/12/2026)
 * on 05/11/2026, compared per booking id across ALL dates (Trap 5).
 * MoeGo had 415 December bookings / 523 dogs; Groomigo held 262 dogs.
 *
 * ## What it refuses to guess
 *
 * Every hold below sends a row to the report instead of the board. The
 * skill's rule is that a dog on no column, or on the wrong person's
 * column, is worse than a dog a human has to place by hand.
 *
 *  - **More than one staff name on a multi-pet booking.** Trap 3: the
 *    `Staffs` column is the DISTINCT people on the booking, not one per
 *    pet, and add-ons are spliced into `Service & add ons` so neither
 *    column aligns with `Pet name`. Zipping them by position handed
 *    Charlotte the wrong dog on a real booking. One name covers every
 *    pet (Trap 11); more than one is a question for Lauren.
 *  - **A groomer who does not resolve.** shared/moegoStaffAlias.ts, never
 *    a local map — Trap 11, and the 107 unassigned bookings it caused.
 *  - **A pet Groomigo has never heard of.** Never invent a dog.
 *  - **A pet that already has something that day**, whatever its state
 *    or booking id (Trap 5). Duplicating a dog is the worst outcome.
 *  - **A duration it cannot derive** from the ladder in Trap 1.
 *
 * ## Guards on the write
 *
 * One transaction. Nothing is inserted for a held row. Every insert is
 * counted and the whole thing rolls back unless the totals match. Each
 * created row re-checks "does this pet already have that day" INSIDE the
 * transaction, so two runs cannot race each other onto the board.
 *
 * `price` and `gross_price` stay NULL: MoeGo's `Total price` is the
 * BOOKING total and frequently reads $0.00, so copying it inflates
 * revenue on a sibling dog.
 *
 * `workflow_state = 'scheduled'`, `status = 'pending'`, matching every
 * other imported row, and the reminder columns are left NULL so these
 * behave like any other real upcoming booking.
 *
 * ## One thing the skill did not anticipate
 *
 * Trap 8 says to confirm SMS automation is OFF before writing. It is ON
 * as of 05/11/2026. This is still safe: a direct SQL insert runs no
 * application code, so no confirmation is sent, and decideBookingConfirmation
 * refuses any row carrying a moego_appointment_id anyway. These dogs WILL
 * get reminders in December, which is correct for real bookings.
 */
import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";
import {
  resolveMoegoStaffForPets, describeStaffResolution,
  type MoegoStaffMember, type MoegoStaffAlias,
} from "../shared/moegoStaffAlias";
import { phoneMatchKey } from "../shared/moegoImport";

const APPLY = process.argv.includes("--apply");
const FILE = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".txt"));
const TENANT = 1;
if (!FILE) { console.error("usage: <file.txt> [--apply]"); process.exit(1); }

type Row = {
  bookingId: string; date: string; time: string; moegoClientId: string;
  clientName: string; phone: string; pets: string[]; services: string; staffs: string;
};

const rows: Row[] = fs.readFileSync(FILE, "utf8").trim().split("\n").map((line) => {
  const [bookingId, date, time, moegoClientId, clientName, phone, petName, services, staffs] = line.split("|");
  return {
    bookingId, date, time, moegoClientId, clientName, phone, services, staffs,
    pets: petName.split(",").map((p) => p.trim()).filter(Boolean),
  };
});

/** "23/12/2026" + "01:00PM" -> a Brisbane wall-clock the DB can take as UTC+10. */
function slot(date: string, time: string): string {
  const [d, m, y] = date.split("/");
  const match = /^(\d{1,2}):(\d{2})(AM|PM)$/i.exec(time.replace(/\s/g, ""));
  if (!match) throw new Error(`unreadable time ${time}`);
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${y}-${m}-${d} ${String(hour).padStart(2, "0")}:${match[2]}:00`;
}

const ADD_ON = /teeth|anal gland|nail (clipping|painting)|extra care|day\s?care add on|pick up or delivery|asap surcharge|styled groom extra/i;

/** The same ladder the November import used, kept identical deliberately. */
function serviceType(text: string): string | null {
  const s = text.toLowerCase();
  if (/de-?shed/.test(s)) return "deshed";
  if (/^tidy|face\. feet|face feet|hygiene/.test(s)) return "fft";
  if (/style/.test(s)) return "styled_groom";
  if (/bath/.test(s)) return "bath_only";
  if (/nail/.test(s)) return "nail_trim";
  if (/day\s?care/.test(s)) return "daycare";
  if (/full groom|f groom service|groom/.test(s)) return "classic_groom";
  return null;
}

/** Trap 1's ladder, steps 1 and 2: explicit hours, then the named band. */
function durationFrom(text: string, type: string): number | null {
  const hours = /(\d+)\s*hour/i.exec(text);
  if (hours) return Number(hours[1]) * 60;
  const s = text.toLowerCase();
  if (/26-34kg|xl 26/.test(s)) return type === "styled_groom" ? 150 : 120;
  if (/17-25kg|17-25 kg|la 17|large17|large 17/.test(s)) return type === "styled_groom" ? 120 : 105;
  if (/14-17kg|14-16kg|med14|medium 14/.test(s)) return type === "styled_groom" ? 105 : 90;
  if (/11-13kg|11-13 kg|sml-med/.test(s)) return type === "styled_groom" ? 90 : 75;
  if (/sml-10kg|sml -10kg|small-10kg|smal-10kg|-10kg|small/.test(s)) return type === "styled_groom" ? 75 : 60;
  if (type === "bath_only") return 45;
  if (type === "fft") return 45;
  if (type === "nail_trim") return 15;
  if (type === "daycare") return 60;
  return null;
}

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [roster]: any = await c.query(
    "SELECT id, name, is_active isActive FROM staff WHERE tenant_id=?", [TENANT]);
  const [aliasRows]: any = await c.query(
    "SELECT moego_name moegoName, staff_id staffId FROM moego_staff_aliases WHERE tenant_id=?", [TENANT]);
  if (!aliasRows.length) { console.error("moego_staff_aliases is EMPTY — refusing to run (Trap 11)"); process.exit(1); }
  const staffRoster: MoegoStaffMember[] = roster;
  const aliases: MoegoStaffAlias[] = aliasRows;

  const create: any[] = [];
  const held: { booking: string; who: string; why: string }[] = [];

  for (const r of rows) {
    const who = `${r.pets.join(", ")} (${r.clientName}) ${r.date} ${r.time}`;

    // --- client: moego id, then phone, then nothing (Trap 10) -------------
    let [clients]: any = await c.query(
      "SELECT id, first_name, last_name FROM clients WHERE tenant_id=? AND moego_client_id=?",
      [TENANT, r.moegoClientId]);
    let matchedBy = "moego id";
    if (!clients.length && r.phone) {
      const key = phoneMatchKey(r.phone);
      if (key) {
        [clients] = await c.query(
          "SELECT id, first_name, last_name FROM clients WHERE tenant_id=? AND RIGHT(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+61','0'),9)=?",
          [TENANT, key]);
        matchedBy = "phone";
      }
    }
    if (!clients.length) { held.push({ booking: r.bookingId, who, why: `client not in Groomigo (moego id ${r.moegoClientId}, ${r.phone || "no phone"})` }); continue; }
    if (clients.length > 1) { held.push({ booking: r.bookingId, who, why: `${clients.length} Groomigo clients match` }); continue; }
    const client = clients[0];

    /* --- staff ------------------------------------------------------------
     *
     * Andy, 05/11/2026, asked for position after seeing what holding
     * cost: of 84 sibling dogs missing from the December board, the
     * strict rule placed 18.
     *
     * So this uses the project's own resolveMoegoStaffForPets, which is
     * what Trap 11 says to use. One name covers every dog; names equal
     * to dogs are taken in order; any other count is refused, because
     * the names themselves can contain a comma and a wrong split is
     * unrecoverable.
     *
     * Trap 3 warns that position is a coincidence even when the counts
     * line up, and it is right that this is not certain. Both of its
     * worked examples are count MISMATCHES, which this still refuses.
     * Every booking placed by position is printed under "assigned by
     * position" so Lauren can check them against MoeGo's own booking
     * pages, which is the only authoritative source.
     */
    const names = r.staffs.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) { held.push({ booking: r.bookingId, who, why: "MoeGo names no groomer" }); continue; }
    const staffing = resolveMoegoStaffForPets(r.staffs, r.pets.length, staffRoster, aliases);
    if (!staffing.ok) {
      held.push({ booking: r.bookingId, who, why: `${staffing.names.length} groomers for ${staffing.petCount} dog(s) — cannot be split: ${r.staffs}` });
      continue;
    }
    const byPosition = names.length > 1;
    const unresolved = staffing.perPet.find((p) => !p.ok);
    if (unresolved) {
      held.push({ booking: r.bookingId, who, why: `groomer does not resolve: ${describeStaffResolution(unresolved)}` });
      continue;
    }

    // --- service + duration ----------------------------------------------
    const main = r.services.split(",").map((s) => s.trim()).filter((s) => s && !ADD_ON.test(s));
    const mainText = main[0] ?? r.services;
    let type = serviceType(mainText);
    if (/styled groom extra/i.test(r.services) && type === "classic_groom") type = "styled_groom";
    if (!type) { held.push({ booking: r.bookingId, who, why: `service not classifiable: ${r.services}` }); continue; }
    const minutes = durationFrom(mainText, type);
    if (!minutes) { held.push({ booking: r.bookingId, who, why: `no duration derivable from "${mainText}"` }); continue; }

    const start = slot(r.date, r.time);

    for (const [petIndex, petName] of r.pets.entries()) {
      const [pets]: any = await c.query(
        "SELECT id, name FROM pets WHERE client_id=? AND LOWER(TRIM(name))=LOWER(TRIM(?))",
        [client.id, petName]);
      if (!pets.length) { held.push({ booking: r.bookingId, who: `${petName} (${r.clientName})`, why: "no such dog on this client in Groomigo" }); continue; }
      if (pets.length > 1) { held.push({ booking: r.bookingId, who: `${petName} (${r.clientName})`, why: `${pets.length} dogs of that name on this client` }); continue; }
      const pet = pets[0];

      // Trap 5: anything that day, any state, any booking id.
      const [clash]: any = await c.query(
        `SELECT id, workflow_state, moego_appointment_id mid,
                DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%H:%i') t
           FROM appointments
          WHERE pet_id=? AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))=DATE(?)`,
        [pet.id, start]);
      if (clash.length) {
        held.push({ booking: r.bookingId, who: `${petName} (${r.clientName}) ${r.date}`, why: `already has ${clash.length} appointment(s) that day (${clash.map((x: any) => `${x.t} ${x.workflow_state} booking ${x.mid ?? "none"}`).join("; ")})` });
        continue;
      }

      const forThisPet = staffing.perPet[petIndex];
      if (!forThisPet.ok) { held.push({ booking: r.bookingId, who: petName, why: "no groomer for this dog" }); continue; }
      create.push({
        bookingId: r.bookingId, petId: pet.id, petName: pet.name, clientId: client.id,
        clientName: `${client.first_name} ${client.last_name}`, staffId: forThisPet.staffId,
        staffName: forThisPet.staffName, start, minutes, type, matchedBy, byPosition,
      });
    }
  }

  console.log(`MoeGo bookings read      : ${rows.length} (${rows.reduce((a, b) => a + b.pets.length, 0)} dogs)`);
  console.log(`ready to create          : ${create.length} dogs`);
  console.log(`held for a human         : ${held.length}`);
  const byDay: Record<string, number> = {};
  for (const x of create) { const d = x.start.slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1; }
  console.log("\ncreates per day:");
  console.table(Object.keys(byDay).sort().map((d) => ({ day: d, dogs: byDay[d] })));
  const positional = create.filter((x) => x.byPosition);
  if (positional.length) {
    console.log(`\nASSIGNED BY POSITION — ${positional.length} dogs. MoeGo listed one groomer per`);
    console.log("dog on these bookings and they were taken in order. Worth Lauren");
    console.log("checking against the client's own Bookings page in MoeGo:");
    const byBooking = new Map<string, string[]>();
    for (const x of positional) {
      const line = `${x.petName} -> ${x.staffName}`;
      byBooking.set(x.bookingId, [...(byBooking.get(x.bookingId) ?? []), line]);
    }
    for (const [booking, lines] of byBooking) {
      console.log(`  ${booking}  ${lines.join(" | ")}`);
    }
  }
  if (held.length) {
    console.log("\nHELD — these go to Lauren, nothing is written for them:");
    for (const h of held) console.log(`  ${h.booking}  ${h.who}\n      ${h.why}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. ${create.length} dogs would be created. Re-run with --apply.`);
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    let inserted = 0;
    for (const x of create) {
      const [again]: any = await c.query(
        `SELECT id FROM appointments WHERE pet_id=? AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))=DATE(?)`,
        [x.petId, x.start]);
      if (again.length) throw new Error(`${x.petName} gained an appointment on ${x.start.slice(0, 10)} mid-run — rolling back`);

      const [res]: any = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start, scheduled_end,
            workflow_state, status, moego_appointment_id, price, gross_price)
         VALUES (?,?,?,?,?,
                 CONVERT_TZ(?, '+10:00', '+00:00'),
                 CONVERT_TZ(DATE_ADD(?, INTERVAL ? MINUTE), '+10:00', '+00:00'),
                 'scheduled','pending',?,NULL,NULL)`,
        [TENANT, x.clientId, x.petId, x.staffId, x.type, x.start, x.start, x.minutes, x.bookingId]);
      if (res.affectedRows !== 1) throw new Error(`${x.petName}: inserted ${res.affectedRows} rows`);
      inserted++;
    }
    if (inserted !== create.length) throw new Error(`inserted ${inserted}, expected ${create.length}`);
    await c.commit();
    console.log(`\ncommitted — ${inserted} dogs created`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  const [after]: any = await c.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') day, COUNT(*) dogs
       FROM appointments
      WHERE DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) BETWEEN '2026-12-01' AND '2026-12-31'
        AND workflow_state<>'cancelled' GROUP BY day ORDER BY day`);
  console.table(after);
  await c.end();
})();

/**
 * Add the five clients November's bookings need and Groomigo does not
 * have, with their dog and their appointment.
 *
 * Andy, 01/11/2026: "Add those 5 new clients."
 *
 * The November import deliberately created no client and no pet, and
 * reported these five instead. Duplicate people and duplicate dogs are
 * expensive here — a pet can only ever be retired by marking it
 * departed — so each one is checked against the MoeGo id, the phone
 * number and the email address before anything is written. All three
 * found nothing on 01/11/2026: they are genuinely new to the salon,
 * with MoeGo ids in the 105-106 million range, which is recent.
 *
 *   corepack pnpm exec tsx scripts/moego-new-clients-2026-11-01.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-new-clients-2026-11-01.ts --apply
 *
 * Nine dogs are called Fluffy here and thirteen are called Lacey, every
 * one belonging to somebody else. That is why the checks are on the
 * person, never on the dog's name.
 *
 * Breed comes from MoeGo's calendar. Weight is left empty because
 * nobody has weighed these dogs, but the SIZE BAND is read off the
 * service name through `bandFromServiceText` and recorded as
 * `moego_service`, which is the source that says exactly that — a
 * groomer's own weight or band outranks it and a later import will not
 * overwrite one.
 *
 * No portal account, no setup token, no email and no text: the columns
 * default to `not_enabled`, and a direct write runs no application
 * code anyway. These people get contacted when the salon chooses to.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { bandFromServiceText } from "../shared/dogSizeBand";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

type New = {
  first: string; last: string; phone: string; email: string;
  moegoClientId: string;
  pet: string; breed: string;
  booking: string; day: string; start: string; end: string;
  service: string; serviceType: string; price: string; staffId: number;
};

const PEOPLE: New[] = [
  { first: "Shanon", last: "Nealon", phone: "0433509389", email: "Shanon_nealon@outlook.com",
    moegoClientId: "105885585", pet: "Betty", breed: "Groodle",
    booking: "136096774", day: "13/11", start: "09:30am", end: "11:15am",
    service: "Diamond - Gold (up to 6wks) STYLED 11-13kg - Full Groom - SML/MED",
    serviceType: "styled_groom", price: "215.00", staffId: 1 },
  { first: "Brian", last: "Murtagh", phone: "0493282455", email: "brian100@outlook.com.au",
    moegoClientId: "106097544", pet: "Lacey", breed: "Biewer",
    booking: "137457059", day: "19/11", start: "11:30am", end: "12:30pm",
    service: "Casual / NEW customer SML 10kg Full Groom Small - Classic",
    serviceType: "classic_groom", price: "145.00", staffId: 5 },
  { first: "Caitlin", last: "Abraham", phone: "0401901278", email: "Caitlinlandman@hotmail.com",
    moegoClientId: "106025227", pet: "Wallace", breed: "Scottish Terrier",
    booking: "136970782", day: "25/11", start: "09:30am", end: "11:00am",
    service: "Diamond - Gold (up to 6wks) STYLED 11-13kg - Full Groom - SML/MED",
    serviceType: "styled_groom", price: "180.00", staffId: 6 },
  { first: "Sophie", last: "Bollen", phone: "0450412923", email: "Sophiebootleg@gmail.com",
    moegoClientId: "105938617", pet: "Heather (Hedz)", breed: "Bedlington Terrier",
    booking: "136425153", day: "26/11", start: "08:00am", end: "09:30am",
    service: "Casual/ NEW CLIENT - Style Groom - Sml-med 11-13KG",
    serviceType: "styled_groom", price: "200.00", staffId: 2 },
  // MoeGo spells the name in lower case. Kept as the salon's own
  // capitalisation, since this is the name that appears on the board.
  { first: "Katelyn", last: "Smith", phone: "0406656408", email: "katelyn-smith14@outlook.com",
    moegoClientId: "106640019", pet: "Fluffy", breed: "Cavoodle",
    booking: "138081423", day: "27/11", start: "09:00am", end: "10:30am",
    service: "Bronze (8wks) - SMALL-10kg Style Full Groom - Longer clip/ Trad",
    serviceType: "styled_groom", price: "228.00", staffId: 3 },
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

  for (const p of PEOPLE) {
    const last9 = p.phone.replace(/\D/g, "").slice(-9);
    const [byMoego]: any = await c.query(
      `SELECT id FROM clients WHERE tenant_id=? AND moego_client_id=?`, [TENANT, p.moegoClientId]);
    const [byPhone]: any = await c.query(
      `SELECT id, CONCAT(first_name,' ',last_name) nm FROM clients WHERE tenant_id=?
         AND REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+','') LIKE ?`, [TENANT, `%${last9}`]);
    const [byEmail]: any = await c.query(
      `SELECT id, CONCAT(first_name,' ',last_name) nm FROM clients WHERE tenant_id=? AND LOWER(email)=LOWER(?)`,
      [TENANT, p.email]);
    const hits = [...byMoego, ...byPhone, ...byEmail];
    if (hits.length) throw new Error(`${p.first} ${p.last} already exists: ${hits.map((h: any) => `#${h.id}${h.nm ? " " + h.nm : ""}`).join(", ")}`);

    const [booked]: any = await c.query(
      `SELECT id FROM appointments WHERE tenant_id=? AND moego_appointment_id=?`, [TENANT, p.booking]);
    if (booked.length) throw new Error(`${p.pet}: booking ${p.booking} already on appt ${booked[0].id}`);

    const { band, reason } = bandFromServiceText(p.service);
    console.log(`${p.first} ${p.last}  ${p.phone}  ${p.email}`);
    console.log(`   ${p.pet} (${p.breed})  band ${band ?? `UNSET (${reason})`} from the MoeGo service`);
    console.log(`   ${p.day} ${p.start}-${p.end}  ${p.serviceType}  $${p.price}  staff ${p.staffId}  booking ${p.booking}\n`);
  }

  if (!APPLY) { console.log("DRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const p of PEOPLE) {
      const [cRes]: any = await c.query(
        `INSERT INTO clients (tenant_id, first_name, last_name, email, phone, moego_client_id, notes)
         VALUES (?,?,?,?,?,?,?)`,
        [TENANT, p.first, p.last, p.email, p.phone, p.moegoClientId,
         "Added from MoeGo by the November sync on 01/11/2026."]);
      const clientId = cRes.insertId;
      if (!clientId) throw new Error(`${p.first} ${p.last}: no client id returned`);

      const { band } = bandFromServiceText(p.service);
      const [pRes]: any = await c.query(
        `INSERT INTO pets (tenant_id, client_id, name, species, breed, size_band, size_band_source)
         VALUES (?,?,?,'dog',?,?,?)`,
        [TENANT, clientId, p.pet, p.breed, band, band ? "moego_service" : null]);
      const petId = pRes.insertId;
      if (!petId) throw new Error(`${p.pet}: no pet id returned`);

      const [aRes]: any = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, price,
            scheduled_start, scheduled_end, workflow_state, status,
            moego_appointment_id, notes)
         VALUES (?,?,?,?,?,?,?,?, 'scheduled', 'pending', ?, ?)`,
        [TENANT, clientId, petId, p.staffId, p.serviceType, p.price,
         brisbane(p.day, p.start), brisbane(p.day, p.end), p.booking,
         "Created from MoeGo by the November sync on 01/11/2026."]);
      if (aRes.affectedRows !== 1) throw new Error(`${p.pet}: insert affected ${aRes.affectedRows}`);
      console.log(`  ${p.first} ${p.last} -> client ${clientId}, pet ${petId}, appt ${aRes.insertId}`);
    }
    await c.commit();
    console.log(`\ncommitted — ${PEOPLE.length} clients, ${PEOPLE.length} pets, ${PEOPLE.length} appointments`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();

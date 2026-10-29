/**
 * DRY RUN ONLY — works out what would be created for every dog MoeGo has
 * on a booking that Groomigo's board does not. Writes nothing.
 *
 * Follows .claude/skills/moego-monday-sync/SKILL.md. The traps that bite
 * here: 2 (one MoeGo row is several Groomigo rows), 3 (comma-joined
 * lists are ambiguous — refuse rather than guess), 5 (match on
 * pet+client+date, never the booking id alone), 10 (a client can exist
 * with a NULL moego_client_id) and 11 (staff aliases; abort on any name
 * that does not resolve).
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";
import { getAutoDurationMinutes } from "../shared/appointmentDuration";
import { resolveMoegoStaff, describeStaffResolution } from "../shared/moegoStaffAlias";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/* Trap 11 is handled by shared/moegoStaffAlias.ts, with the aliases
   read from `moego_staff_aliases`. They are NOT written here: a map
   per script is what left 107 forward bookings with nobody against
   them on 14/10/2026, because the two copies had already drifted. */

type Row = { id: string; date: string; time: string; moegoClient: string;
  pets: string[]; services: string[]; total: number; staffs: string[]; status: string };

const rows: Row[] = fs.readFileSync(S + "/moego/schedules-2026-10-29.txt", "utf8")
  .trim().split("\n").map((l) => {
    const [id, date, time, moegoClient, pets, services, total, staffs, status] = l.split("~");
    const [d, m, y] = date.split("/");
    const sp = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    return { id, date: `${y}-${m}-${d}`, time, moegoClient, pets: sp(pets), services: sp(services),
      total: Number(total.replace(/[^0-9.]/g, "")), staffs: sp(staffs), status };
  });

/** Trap 1, in order: an explicit duration in the text, then the weight
 *  band the text names, then the pet's recorded weight. */
function serviceTypeOf(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("de-shed")) return "deshed";
  if (t.includes("bath")) return "bath_only";
  if (t.includes("style") || t.includes("styled")) return "styled_groom";
  if (t.includes("full groom")) return "classic_groom";
  if (t.includes("tidy")) return "classic_groom";
  return "other";
}
function bandWeightOf(text: string): number | null {
  const t = text.toLowerCase();
  if (/20-30\s*kg|large-xl/.test(t)) return 25;
  if (/14-17\s*kg|med14/.test(t)) return 15;
  if (/11-13\s*kg|sml-med/.test(t)) return 12;
  if (/sml\s*-?\s*10\s*kg|small-10kg|sml 10kg|small to medium|small size|short hair|small dog/.test(t)) return 8;
  if (/medium size|long hair|medium/.test(t)) return 15;
  return null;
}
function explicitMinutes(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*hour/i);
  return m ? Math.round(parseFloat(m[1]) * 60) : null;
}

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  const [roster] = await c.query<any[]>("SELECT id, name, is_active AS isActive FROM staff");
  const [aliases] = await c.query<any[]>(
    "SELECT moego_name AS moegoName, staff_id AS staffId FROM moego_staff_aliases WHERE tenant_id = 1");

  const plan: any[] = [], flags: any[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const b of rows) {
    if (b.date < today) { flags.push({ booking: b.id, why: "date is in the past", detail: b.date }); continue; }

    // Trap 10: id, then phone, then email. Here the anchor appointment is
    // the most reliable: it is the same booking, already matched.
    let clientId: number | null = null;
    const [anchor] = await c.query<any[]>(
      `SELECT client_id FROM appointments WHERE moego_appointment_id=? LIMIT 1`, [b.id]);
    if (anchor.length) clientId = anchor[0].client_id;
    else {
      const [byMoego] = await c.query<any[]>(`SELECT id FROM clients WHERE moego_client_id=? LIMIT 1`, [b.moegoClient]);
      if (byMoego.length) clientId = byMoego[0].id;
    }
    if (!clientId) {
      // Fall back to the dogs themselves: all of this booking's pets owned
      // by one client, on a client who has no moego id (Trap 10).
      const [byPets] = await c.query<any[]>(
        `SELECT client_id, COUNT(DISTINCT id) n FROM pets
          WHERE LOWER(REPLACE(name,' ','')) IN (${b.pets.map(() => "?").join(",")})
          GROUP BY client_id HAVING n = ? `, [...b.pets.map(norm), b.pets.length]);
      if (byPets.length === 1) clientId = byPets[0].client_id;
    }
    if (!clientId) { flags.push({ booking: b.id, date: b.date, dogs: b.pets.join("/"), why: "cannot identify the Groomigo client" }); continue; }

    // Everything that client already has that day, whatever its booking id.
    const [onBoard] = await c.query<any[]>(
      `SELECT a.id, p.name, a.price, a.service_type, a.staff_id,
              TIMESTAMPDIFF(MINUTE,a.scheduled_start,a.scheduled_end) mins
         FROM appointments a JOIN pets p ON p.id=a.pet_id
        WHERE a.client_id=? AND DATE(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"))=?
          AND a.workflow_state NOT IN ("cancelled","no_show")`, [clientId, b.date]);
    const have = new Set(onBoard.map((r) => norm(r.name)));
    const missing = b.pets.filter((p) => !have.has(norm(p)));
    if (!missing.length) continue;

    // Trap 3: the comma-joined lists must agree before anything is aligned.
    const aligned = b.services.length === b.pets.length;
    const siblingTotal = onBoard.reduce((n, r) => n + Number(r.price ?? 0), 0);

    for (const dog of missing) {
      const i = b.pets.indexOf(dog);
      const svcText = aligned ? b.services[i] : null;
      const f: any = { booking: b.id, date: b.date, time: b.time, clientId, dog };

      const [pets] = await c.query<any[]>(
        `SELECT id, weight_kg FROM pets WHERE client_id=? AND LOWER(REPLACE(name,' ',''))=?`, [clientId, norm(dog)]);
      if (!pets.length) { flags.push({ ...f, why: "no such pet on this client in Groomigo" }); continue; }
      f.petId = pets[0].id;

      if (!svcText) { flags.push({ ...f, why: `services do not align with dogs (${b.pets.length} dogs, ${b.services.length} service entries) — add-ons make the position meaningless`, services: b.services.join(" | ") }); continue; }
      f.service = svcText;
      f.serviceType = serviceTypeOf(svcText);

      // Duration
      const expl = explicitMinutes(svcText);
      const bandW = bandWeightOf(svcText);
      f.minutes = expl
        ?? (bandW !== null ? getAutoDurationMinutes(f.serviceType, bandW) : null)
        ?? getAutoDurationMinutes(f.serviceType, pets[0].weight_kg)
        ?? (onBoard[0]?.mins ?? null);
      f.minutesFrom = expl ? "stated in the service name"
        : bandW !== null && getAutoDurationMinutes(f.serviceType, bandW) ? "weight band in the service name"
        : getAutoDurationMinutes(f.serviceType, pets[0].weight_kg) ? "the dog's recorded weight"
        : onBoard[0]?.mins ? "the sibling's slot (last resort)" : "UNRESOLVED";
      if (!f.minutes) { flags.push({ ...f, why: "cannot work out a duration" }); continue; }

      // Price. MoeGo gives a BOOKING total, never a per-dog charge.
      const sameService = b.services.every((s) => s === b.services[0]);
      if (b.total === 0) { f.price = "0.00"; f.priceFrom = "booking total is $0 — membership covers it"; }
      /* Subtraction — booking total less the siblings already priced in
         Groomigo — was tried and abandoned. The Groomigo prices came
         from the original import and do not reconcile with MoeGo's
         current totals: it produced $15 for Coco's full groom (total
         $250, sibling Olive carrying $235) and $90 for Belle. Two
         inputs that disagree cannot be differenced.

         A service price list was tried too, built from MoeGo's own
         single-dog bookings, and it does not exist: across 176 of them
         "Diamond - Gold (up to 6wks) SML-10kg-Full Groom Classic" is
         charged at $110, $125 AND $100. MoeGo prices per client, not
         per service. So the only safe prices are a $0 booking and an
         even split of one shared service. */
      else if (sameService && missing.length === b.pets.length) {
        f.price = (b.total / b.pets.length).toFixed(2); f.priceFrom = `all ${b.pets.length} dogs share one service — $${b.total} split evenly`;
      } else {
        /* Everything else is complete EXCEPT the price. The dog can still
           go on the board — which is the operational problem — with the
           booking total recorded so staff can price it at checkout. */
        f.price = null;
        f.priceFrom = `NEEDS A PRICE — MoeGo booking total $${b.total} covers ${b.pets.map((p) => p).join(" + ")}`;
      }

      // Staff, by position; one staff on the booking does all the dogs.
      const raw = b.staffs.length === 1 ? b.staffs[0] : b.staffs[i];
      if (!raw) { flags.push({ ...f, why: "no staff named for this position on the booking" }); continue; }
      const resolution = resolveMoegoStaff(raw, roster, aliases);
      if (!resolution.ok) { flags.push({ ...f, why: describeStaffResolution(resolution) }); continue; }
      f.staff = resolution.viaAlias ? `${raw} → ${resolution.staffName}` : resolution.staffName;
      f.staffId = resolution.staffId;
      f.status = b.status;
      plan.push(f);
    }
  }

  fs.writeFileSync(S + "/plan.json", JSON.stringify({ plan, flags }, null, 1));
  const priced = plan.filter((p) => p.price !== null);
  const unpriced = plan.filter((p) => p.price === null);
  console.log(`WOULD CREATE: ${plan.length} appointments  (${priced.length} with a confident price, ${unpriced.length} needing one)`);
  console.log(`CANNOT CREATE: ${flags.length}\n`);
  const byDate: Record<string, any[]> = {};
  for (const p of plan) (byDate[p.date] ??= []).push(p);
  for (const d of Object.keys(byDate).sort()) {
    console.log(`${d}`);
    for (const p of byDate[d]) console.log(`   ${p.time.padEnd(9)} ${p.dog.padEnd(10)} ${String(p.minutes).padStart(3)}m  ${(p.price === null ? "price?" : "$" + p.price).padStart(8)}  ${p.staff.padEnd(28)} ${p.serviceType}`);
  }
  console.log(`\nMONEY I AM CONFIDENT OF: $${priced.reduce((n, p) => n + Number(p.price), 0).toFixed(2)} across ${priced.length} dogs`);
  console.log(`DOGS NEEDING A PRICE SET BY A HUMAN: ${unpriced.length}`);
  console.log("\nCANNOT CREATE AT ALL:");
  for (const f of flags) console.log(`   ${f.date ?? "?"} ${String(f.dog ?? "?").padEnd(10)} ${f.why}`);
  await c.end();
})().catch((e) => { console.log("FAILED:", e.message); process.exit(1); });

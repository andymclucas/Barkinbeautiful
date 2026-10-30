/**
 * Bring MoeGo's January 2027 bookings onto the Groomigo board.
 *
 * Lauren, 30/10/2026: "I used moego to rebook dogs yesterday still cause
 * it's really hard to see where I have spots left until Xmas... I have
 * people making spots now for January."
 *
 * Groomigo held FOUR dogs in January; MoeGo held 265 bookings / 347 dogs.
 * The weekly sync only looks three weeks ahead, so January was never going
 * to arrive on its own.
 *
 * Scope: the 215 bookings that can be imported with a groomer we are sure
 * of. The other 50 are multi-pet bookings carrying more than one staff
 * name, where MoeGo's `Staffs` column is the distinct people on the
 * booking rather than one per dog (Trap 3) — those are held back for the
 * per-client pages, not guessed at.
 *
 *   node --experimental-strip-types scripts/moego-import-january-2026-10-30.ts <file.tsv>
 *   node --experimental-strip-types scripts/moego-import-january-2026-10-30.ts <file.tsv> --apply
 *
 * Dry run unless --apply. Everything is asserted inside one transaction
 * and rolled back whole on any surprise.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { resolveMoegoStaffForPets, describeStaffResolution } from "../shared/moegoStaffAlias";
import { phoneMatchKey } from "../shared/moegoImport";
import { getAutoDurationMinutes } from "../shared/appointmentDuration";

const TENANT = 1;
const APPLY = process.argv.includes("--apply");
const FILE = process.argv[2];
if (!FILE) { console.error("usage: <file.tsv> [--apply]"); process.exit(1); }

type Row = {
  booking: string; date: string; time: string; moegoClientId: string;
  first: string; last: string; phone: string; email: string;
  pets: string; services: string; staffs: string;
};

const rows: Row[] = readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((line) => {
  const f = line.split("\t");
  return { booking: f[0], date: f[1], time: f[2], moegoClientId: f[3], first: f[4],
           last: f[5], phone: f[6], email: f[7], pets: f[8], services: f[9], staffs: f[10] };
});

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * MoeGo's service text -> Groomigo's serviceType.
 *
 * Order matters: "Style Full Groom" also contains "Full Groom", and a
 * styled groom priced and timed as a classic is a real mistake on the
 * board. Anything unrecognised returns null and the row is held, never
 * defaulted to "other" — a wrong service type sets the wrong duration.
 */
function serviceType(text: string): string | null {
  const t = text.toLowerCase();
  /* Upcharges that are NOT a dog's service. "Styled Groom EXTRA" sits
     in the same comma list as the real services and matches /style/,
     so Marcelle Arkadieff's three dogs came out as four services and
     the booking could not be aligned. */
  if (/\bextra\b|surcharge|add ?on|teeth|anal gland|nail paint/.test(t)) return null;
  if (/de-?shed/.test(t)) return "deshed";
  if (/\bbath\b/.test(t)) return "bath_only";
  if (/nail clip|nail trim/.test(t)) return "nail_trim";
  if (/day ?care(?! add)/.test(t)) return "daycare";
  if (/style|styled/.test(t)) return "styled_groom";
  if (/full groom|f groom/.test(t)) return "classic_groom";
  if (/\btidy\b|face\.? ?feet/.test(t)) return "fft";
  return null;
}

/**
 * The weight band MoeGo spells out in the service name (Trap 1, step 2).
 * Read before the pet's recorded weight because on 05/10/2026 not one
 * imported dog had a weight on file.
 */
function bandKgFromService(text: string): number | null {
  const t = text.toUpperCase().replace(/\s+/g, "");
  if (/GIANT36-80|36-80KG/.test(t)) return 40;
  if (/XL26-34|26-34KG/.test(t)) return 30;
  if (/17-25KG|LA17-25|LARGE17-25/.test(t)) return 20;
  if (/MED14-17|14-17KG|MEDIUM14-16|14-16KG/.test(t)) return 15;
  if (/11-13KG/.test(t)) return 12;
  if (/SML-?10KG|SMALL-?10KG|10KG/.test(t)) return 8;
  return null;
}

/** DD/MM/YYYY + "hh:mm AM" in Brisbane -> UTC Date. No DST here. */
function brisbane(date: string, time: string): Date | null {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!d || !t) return null;
  let hour = Number(t[1]) % 12;
  if (/pm/i.test(t[3])) hour += 12;
  return new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1]), hour - 10, Number(t[2])));
}

const dateKey = (date: string) => { const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date)!; return `${d[3]}-${d[2]}-${d[1]}`; };

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });

  const [roster]: any = await c.query(
    "SELECT id, name, is_active AS isActive FROM staff WHERE tenant_id = ?", [TENANT]);
  const [aliases]: any = await c.query(
    "SELECT moego_name AS moegoName, staff_id AS staffId FROM moego_staff_aliases WHERE tenant_id = ?", [TENANT]);
  if (aliases.length === 0) { console.error("ABORT: moego_staff_aliases is empty — nothing would resolve."); process.exit(1); }

  const plan: any[] = [];
  const held: { why: string; detail: string }[] = [];

  for (const r of rows) {
    const pets = list(r.pets);
    const start = brisbane(r.date, r.time);
    if (!start) { held.push({ why: "unreadable date/time", detail: `${r.booking} ${r.date} ${r.time}` }); continue; }

    // ── client: moego id, then phone, then email (Trap 10) ────────────────
    let [[client]]: any = await c.query(
      "SELECT id, moego_client_id FROM clients WHERE tenant_id = ? AND moego_client_id = ?", [TENANT, r.moegoClientId]);
    let matchedBy = "moego id";
    if (!client && r.phone) {
      const key = phoneMatchKey(r.phone);
      const [cands]: any = await c.query(
        "SELECT id, moego_client_id, phone FROM clients WHERE tenant_id = ?", [TENANT]);
      const hit = cands.filter((x: any) => phoneMatchKey(x.phone ?? "") === key && key);
      if (hit.length === 1) { client = hit[0]; matchedBy = "phone"; }
      else if (hit.length > 1) { held.push({ why: "phone matches several clients", detail: `${r.booking} ${r.first} ${r.last}` }); continue; }
    }
    if (!client && r.email) {
      const [hit]: any = await c.query(
        "SELECT id, moego_client_id FROM clients WHERE tenant_id = ? AND LOWER(email) = LOWER(?)", [TENANT, r.email]);
      if (hit.length === 1) { client = hit[0]; matchedBy = "email"; }
    }
    if (!client) { held.push({ why: "client not in Groomigo", detail: `${r.booking} ${r.first} ${r.last} ${r.phone}` }); continue; }

    // ── staff, via the shared resolver only (Trap 11) ─────────────────────
    const staff = resolveMoegoStaffForPets(r.staffs, pets.length, roster, aliases);
    if (!staff.ok) { held.push({ why: "staff/pet counts disagree", detail: `${r.booking} ${r.staffs} vs ${pets.length} pets` }); continue; }
    const unresolved = staff.perPet.find((s) => !s.ok);
    if (unresolved) { held.push({ why: "groomer unresolved", detail: `${r.booking} ${describeStaffResolution(unresolved)}` }); continue; }

    /**
     * The main service per dog.
     *
     * `Service & add ons` splices add-ons inline, so it does NOT align with
     * the pets as written (Trap 3) — but the MAIN services within it do,
     * one per dog in pet order. Strip the add-ons and the alignment is
     * recoverable; the skill's own example (3 pets, 5 entries, two with
     * Anal Glands) reduces to exactly 3.
     *
     * This is not the same claim as Trap 3 refuses for STAFF. There the
     * column lists distinct people, so there is no per-dog entry to
     * recover at all. Here there is one main service per dog.
     *
     * Anything that does not reduce to 1 or petCount is held, never
     * guessed: on this pull Coco/Socks is classic+styled and Winnie/Xena
     * is styled+classic, so picking the first for both would have set the
     * wrong service AND the wrong duration on half of them.
     */
    const allServices = list(r.services);
    const mainServices = allServices.filter((x) => serviceType(x) !== null);
    let perPetService: string[];
    /* A nail trim beside a groom on a multi-pet booking is ambiguous: it
       is either the second dog's whole service or an add-on to the
       first dog's groom, and the two differ by a 60-minute slot on the
       board. Nail Clipping is in the add-on catalogue, which makes the
       add-on reading at least as likely. One booking, held rather than
       guessed — Emily Conway's Yuji/Mia on 06/01. */
    if (pets.length > 1 && mainServices.some((x) => serviceType(x) === "nail_trim")) {
      held.push({ why: "nail trim beside a groom — add-on or second dog's service?", detail: `${r.booking} ${r.first} ${r.last}: ${r.pets} / ${r.services}` });
      continue;
    }
    if (mainServices.length === pets.length) perPetService = mainServices;
    else if (mainServices.length === 1) perPetService = pets.map(() => mainServices[0]);
    else {
      held.push({ why: "services do not reduce to one per dog", detail: `${r.booking} ${pets.length} pets, ${mainServices.length} main services: ${r.services}` });
      continue;
    }
    let bad = false;

    for (let i = 0; i < pets.length; i++) {
      const petName = pets[i];
      const main = perPetService[i];
      const type = serviceType(main);
      if (!type) { held.push({ why: "service not classifiable", detail: `${r.booking} "${main}"` }); bad = true; break; }

      const [[pet]]: any = await c.query(
        "SELECT id, name, weight_kg AS weightKg FROM pets WHERE tenant_id = ? AND client_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))",
        [TENANT, client.id, petName]);
      if (!pet) { held.push({ why: "pet not on that client", detail: `${r.booking} ${petName} (${r.first} ${r.last})` }); bad = true; break; }

      // Trap 5, both halves: this pet on this date in ANY state, and this
      // booking id ANYWHERE regardless of date.
      const [sameDay]: any = await c.query(
        `SELECT id, workflow_state, status FROM appointments
          WHERE tenant_id = ? AND pet_id = ?
            AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) = ?`, [TENANT, pet.id, dateKey(r.date)]);
      if (sameDay.length) { held.push({ why: "pet already booked that day", detail: `${r.booking} ${petName} -> appt ${sameDay[0].id} (${sameDay[0].workflow_state})` }); bad = true; break; }

      const [sameBooking]: any = await c.query(
        `SELECT id, DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d FROM appointments
          WHERE tenant_id = ? AND moego_appointment_id = ? AND pet_id = ?`, [TENANT, r.booking, pet.id]);
      if (sameBooking.length) { held.push({ why: "booking id already present elsewhere", detail: `${r.booking} ${petName} -> appt ${sameBooking[0].id} on ${sameBooking[0].d}` }); bad = true; break; }

      const kg = bandKgFromService(main) ?? pet.weightKg ?? null;
      const mins = getAutoDurationMinutes(type, kg) ?? (type === "bath_only" ? 60 : type === "deshed" ? (/2 hour/i.test(main) ? 120 : 60) : 60);

      plan.push({
        booking: r.booking, petName, petId: pet.id, clientId: client.id, matchedBy,
        staffId: (staff.perPet[i] as any).staffId, staffName: (staff.perPet[i] as any).staffName,
        start, end: new Date(start.getTime() + mins * 60000), mins, type, service: main,
        date: r.date, backfillMoegoId: !client.moego_client_id && matchedBy !== "moego id" ? r.moegoClientId : null,
      });
    }
    if (bad) continue;
  }

  // ── report ────────────────────────────────────────────────────────────
  const byDay = new Map<string, number>();
  for (const p of plan) byDay.set(p.date, (byDay.get(p.date) ?? 0) + 1);
  console.log(`\nMoeGo rows read ............ ${rows.length}`);
  console.log(`dogs to create ............. ${plan.length}`);
  console.log(`held for a human ........... ${held.length}`);
  console.log(`\nby day:`);
  for (const [d, n] of [...byDay].sort((a, b) => a[0].slice(6) + a[0].slice(3,5) + a[0].slice(0,2) < b[0].slice(6) + b[0].slice(3,5) + b[0].slice(0,2) ? -1 : 1))
    console.log(`  ${d}  ${n}`);
  const byType = new Map<string, { n: number; mins: Set<number> }>();
  for (const p of plan) {
    if (!byType.has(p.type)) byType.set(p.type, { n: 0, mins: new Set() });
    const e = byType.get(p.type)!; e.n++; e.mins.add(p.mins);
  }
  console.log(`\nservice types assigned (and the durations they got):`);
  for (const [t, e] of [...byType].sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${t.padEnd(14)} ${String(e.n).padStart(3)}   ${[...e.mins].sort((a,b)=>a-b).join(", ")} min`);

  const byStaff = new Map<string, number>();
  for (const p of plan) byStaff.set(p.staffName, (byStaff.get(p.staffName) ?? 0) + 1);
  console.log(`\ngroomers assigned:`);
  for (const [n, c2] of [...byStaff].sort((a, b) => b[1] - a[1])) console.log(`  ${n.padEnd(20)} ${c2}`);

  const viaPhone = plan.filter((p) => p.matchedBy !== "moego id");
  if (viaPhone.length) console.log(`\nclients matched by ${[...new Set(viaPhone.map(p=>p.matchedBy))].join("/")}: ${new Set(viaPhone.map((p) => p.clientId)).size}`);
  if (held.length) {
    console.log(`\nHELD — not imported:`);
    const grouped = new Map<string, string[]>();
    for (const h of held) { if (!grouped.has(h.why)) grouped.set(h.why, []); grouped.get(h.why)!.push(h.detail); }
    for (const [why, items] of grouped) {
      console.log(`  ${why} (${items.length})`);
      for (const i of items.slice(0, 8)) console.log(`      ${i}`);
      if (items.length > 8) console.log(`      … and ${items.length - 8} more`);
    }
  }

  if (!APPLY) { console.log(`\nDRY RUN — nothing written. Re-run with --apply to create ${plan.length} appointments.\n`); await c.end(); return; }

  // ── apply ─────────────────────────────────────────────────────────────
  await c.beginTransaction();
  try {
    let created = 0;
    for (const p of plan) {
      const [res]: any = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start, scheduled_end,
            workflow_state, status, moego_appointment_id, price, gross_price, notes)
         VALUES (?,?,?,?,?,?,?,'scheduled','pending',?,NULL,NULL,?)`,
        [TENANT, p.clientId, p.petId, p.staffId, p.type, p.start, p.end, p.booking,
         `Imported from MoeGo 30/10/2026 — ${p.service}`]);
      if (res.affectedRows !== 1) throw new Error(`insert affected ${res.affectedRows} for ${p.booking}/${p.petName}`);
      created++;
      if (p.backfillMoegoId) {
        await c.query("UPDATE clients SET moego_client_id = ? WHERE id = ? AND moego_client_id IS NULL",
          [p.backfillMoegoId, p.clientId]);
      }
    }
    if (created !== plan.length) throw new Error(`created ${created}, planned ${plan.length}`);

    // Post-conditions, inside the transaction: no pet booked twice in January.
    const [dupes]: any = await c.query(
      `SELECT pet_id, DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d, COUNT(*) n
         FROM appointments
        WHERE tenant_id = ? AND status NOT IN ('cancelled','no_show')
          AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) BETWEEN '2027-01-01' AND '2027-01-31'
        GROUP BY pet_id, d HAVING n > 1`, [TENANT]);
    if (dupes.length) throw new Error(`${dupes.length} pet/day duplicates after insert — rolling back`);

    await c.commit();
    console.log(`\nAPPLIED — ${created} appointments created, no pet booked twice.\n`);
  } catch (e) {
    await c.rollback();
    console.error(`\nROLLED BACK: ${(e as Error).message}\n`);
    process.exitCode = 1;
  }
  await c.end();
})();

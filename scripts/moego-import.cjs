/**
 * Create the Groomigo bookings a MoeGo pull says are missing.
 *
 * Written fresh for the 28/10/2026 run, as the moego-monday-sync skill
 * requires: there is no importer in the app, and every trap below cost
 * somebody a morning the first time it was met.
 *
 * Dry run by default. --apply commits, in one transaction, and aborts
 * whole if any row surprises it.
 *
 *   node scripts/moego-import.cjs            # report, writes nothing
 *   node scripts/moego-import.cjs --apply    # creates them
 *
 * Input is a TSV pulled from MoeGo's "Appointment schedules" report,
 * one line per DOG:
 *   bookingId, date, time, moegoClientId, phone, pet, service, staff
 */
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");
const fs = require("fs");

const APPLY = process.argv.includes("--apply");
/**
 * The pull lives OUTSIDE the repository.
 *
 * Every line is a real client with their phone number, and this repo
 * is on GitHub. Pass the path as the first argument:
 *
 *   node scripts/moego-import.cjs /path/to/pull.tsv [--apply]
 */
const TSV = process.argv.find((a) => a.endsWith(".tsv"));
if (!TSV) {
  console.error("Give the path to the MoeGo pull .tsv (keep it outside the repo).");
  process.exit(1);
}
const TENANT = 1;

/**
 * MoeGo's name for a groomer is not always Groomigo's.
 *
 * "Megan Graham" is "Megs Graham" here and neither string contains the
 * other, so a substring match files the dog under nobody. "Bather 1"
 * is MoeGo's alias for whoever is on baths — Stephanie Baldwin, by an
 * exact name match that moves if she is renamed. Anything unresolved
 * ABORTS rather than inserting a staff-less appointment.
 */
const STAFF_ALIASES = {
  "megan graham": "Megs Graham",
  "bather 1": "Stephanie Baldwin",
};

/**
 * The weight band MoeGo spells out in the service text.
 *
 * This is the duration source, not the pet's recorded weight: on
 * 05/10/2026 not one of eleven dogs had a weight on file, so reading
 * the band out of the service name is the only thing that works. The
 * band drives getAutoDurationMinutes via the same table the app uses.
 */
const BAND_MINUTES = {
  small: 60, small_medium: 75, medium: 90, large: 120, extra_large: 150, giant: 180,
};

function bandFromService(text) {
  const t = String(text).toLowerCase();
  if (/\b(17-25|la ?17|large)\b/.test(t)) return "large";
  if (/\b(14-?1[67]|med ?14|medium)\b/.test(t)) return "medium";
  if (/\b(11-?13|sml\/med|sml-med)\b/.test(t)) return "small_medium";
  if (/\b(26-34|xl)\b/.test(t)) return "extra_large";
  if (/\b(36-80|giant)\b/.test(t)) return "giant";
  if (/\b(sml|small|10kg)\b/.test(t)) return "small";
  return null;
}

/** The salon's service names mapped onto the appointment enum. */
function serviceTypeFromText(text) {
  const t = String(text).toLowerCase();
  if (/day ?care/.test(t)) return "daycare";
  if (/de-?shed/.test(t)) return "deshed";
  if (/\bbath\b/.test(t)) return "bath_only";
  if (/\btidy\b/.test(t)) return "fft";
  if (/style/.test(t)) return "styled_groom";
  if (/groom/.test(t)) return "classic_groom";
  return "other";
}

/** An explicit duration in the service text beats any guess. */
function explicitMinutes(text) {
  const hours = /(\d+(?:\.\d+)?)\s*hour/i.exec(text);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const mins = /(\d+)\s*min/i.exec(text);
  return mins ? Number(mins[1]) : null;
}

function durationFor(service) {
  const explicit = explicitMinutes(service);
  if (explicit) return { minutes: explicit, from: "stated in the service" };
  const band = bandFromService(service);
  if (band) return { minutes: BAND_MINUTES[band], from: `${band} band in the service name` };
  // Never copy another dog's slot — see Trap 1. An hour is the salon's
  // commonest size and the figure that understates least often.
  return { minutes: 60, from: "DEFAULT — no band in the service name" };
}

/** Last nine digits: Australian numbers lose their leading zero constantly. */
function phoneKey(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

/** "04/11/2026" + "01:00 PM" -> the UTC instant for that Brisbane time. */
function brisbaneInstant(date, time) {
  const [d, m, y] = date.split("/").map(Number);
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (/pm/i.test(match[3])) hour += 12;
  // Brisbane is UTC+10 with no DST, which is the only reason a fixed
  // offset is safe here.
  return new Date(Date.UTC(y, m - 1, d, hour - 10, Number(match[2])));
}

(async () => {
  const rows = fs.readFileSync(TSV, "utf8").trim().split("\n").map((line) => {
    const [booking, date, time, moegoClientId, phone, pet, service, staff] = line.split("\t");
    return { booking, date, time, moegoClientId, phone, pet, service, staff };
  });

  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    /**
     * Pin the driver to UTC, or it writes a Date using the MACHINE's
     * timezone. This run learned that the hard way: brisbaneInstant
     * correctly produced 01:30Z for a 11:30 Brisbane booking, mysql2
     * converted it to local time on the way out, and the column stored
     * 11:30 as though it were UTC — every one of 24 appointments
     * landed ten hours late, at 9:30 PM on next week's board.
     *
     * The app itself is unaffected: Drizzle pins this already, which
     * is why bookings made in the UI were correct beside these. It is
     * only direct scripts that have to say so, and the project's note
     * about pinning the timezone was about READING timestamps. It
     * applies just as much to writing them.
     */
    timezone: "Z",
  });

  // Staff, resolved up front so an unknown name stops the run before
  // anything is written.
  const [staffRows] = await c.query("SELECT id, name FROM staff WHERE tenant_id=? AND is_active=1", [TENANT]);
  const staffByName = new Map(staffRows.map((s) => [s.name.toLowerCase(), s.id]));
  const resolveStaff = (name) => {
    const wanted = (STAFF_ALIASES[name.trim().toLowerCase()] ?? name).trim().toLowerCase();
    return staffByName.get(wanted) ?? null;
  };

  const plan = [];
  const blocked = [];

  for (const r of rows) {
    const start = brisbaneInstant(r.date, r.time);
    if (!start) { blocked.push({ ...r, why: "unreadable date/time" }); continue; }

    const staffId = resolveStaff(r.staff);
    if (!staffId) { blocked.push({ ...r, why: `staff "${r.staff}" not in Groomigo` }); continue; }

    // Trap 10: a client can be in Groomigo with a NULL moego_client_id.
    // Match by id, then PHONE, before concluding they are new.
    let [[client]] = await c.query(
      "SELECT id, moego_client_id FROM clients WHERE tenant_id=? AND moego_client_id=? LIMIT 1",
      [TENANT, r.moegoClientId],
    );
    let matchedBy = "moego id";
    if (!client) {
      const [byPhone] = await c.query(
        `SELECT id, moego_client_id FROM clients WHERE tenant_id=?
           AND RIGHT(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+',''), 9) = ? LIMIT 2`,
        [TENANT, phoneKey(r.phone)],
      );
      if (byPhone.length === 1) { client = byPhone[0]; matchedBy = "phone"; }
      else if (byPhone.length > 1) { blocked.push({ ...r, why: "phone matches more than one client" }); continue; }
    }
    if (!client) { blocked.push({ ...r, why: "client not found — needs creating first" }); continue; }

    const [[pet]] = await c.query(
      "SELECT id, name, weight_kg FROM pets WHERE tenant_id=? AND client_id=? AND LOWER(name)=LOWER(?) LIMIT 1",
      [TENANT, client.id, r.pet],
    );
    if (!pet) { blocked.push({ ...r, why: `no pet named "${r.pet}" on that client` }); continue; }

    /**
     * Trap 5: match on (pet, date) whatever the booking id or state.
     * A row created in Groomigo carries a NULL booking id and a
     * cancelled row is still a row — checking the id alone duplicated
     * two dogs onto a live board on 29/09/2026.
     */
    const [clash] = await c.query(
      `SELECT id, workflow_state, moego_appointment_id FROM appointments
        WHERE tenant_id=? AND pet_id=?
          AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) = STR_TO_DATE(?, '%d/%m/%Y')`,
      [TENANT, pet.id, r.date],
    );
    if (clash.length > 0) {
      blocked.push({ ...r, why: `already has a booking that day (#${clash[0].id}, ${clash[0].workflow_state})` });
      continue;
    }

    /** And the booking id across ALL dates — Trap 5's second half. */
    const [elsewhere] = await c.query(
      `SELECT id, DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d, workflow_state
         FROM appointments WHERE tenant_id=? AND moego_appointment_id=? AND pet_id=?`,
      [TENANT, r.booking, pet.id],
    );
    if (elsewhere.length > 0) {
      const when = new Date(elsewhere[0].d).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
      blocked.push({ ...r, why: `booking ${r.booking} already exists on ${when} (${elsewhere[0].workflow_state}) — a move, not a new dog` });
      continue;
    }

    const serviceType = serviceTypeFromText(r.service);
    const duration = durationFor(r.service);

    /**
     * Day care needs a real collection time, and MoeGo does not give
     * one — "DAY CARE ADD ON WITH GROOMING $10/HR" states a rate, not
     * an end. A derived duration would put a made-up "Out" time on the
     * day care board, which is the one number that section exists to
     * show. Held back for somebody to set it.
     */
    if (serviceType === "daycare" && duration.from.startsWith("DEFAULT")) {
      blocked.push({ ...r, why: "day care with no stated hours — set the pick-up time by hand" });
      continue;
    }
    plan.push({
      ...r, clientId: client.id, petId: pet.id, petName: pet.name, staffId,
      start, end: new Date(start.getTime() + duration.minutes * 60_000),
      serviceType, duration, matchedBy,
      backfillMoegoId: matchedBy === "phone" && !client.moego_client_id,
    });
  }

  console.log(`\nREAD ${rows.length} dogs from MoeGo\n`);
  console.log(`WOULD CREATE: ${plan.length}`);
  for (const p of plan) {
    console.log(
      `  ${p.date} ${p.time.padEnd(8)} ${p.petName.padEnd(18)} staff=${p.staff.padEnd(18)}` +
      ` ${p.serviceType.padEnd(14)} ${String(p.duration.minutes).padStart(3)}m (${p.duration.from})` +
      (p.matchedBy !== "moego id" ? `  [client matched by ${p.matchedBy}]` : ""),
    );
  }
  console.log(`\nHELD BACK: ${blocked.length}`);
  for (const b of blocked) console.log(`  ${b.date} ${b.pet.padEnd(18)} ${b.why}`);

  if (plan.length === 0) { await c.end(); return; }

  await c.beginTransaction();
  try {
    let written = 0;
    for (const p of plan) {
      const [res] = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type, scheduled_start, scheduled_end,
            workflow_state, status, moego_appointment_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,'scheduled','confirmed',?,NOW(),NOW())`,
        [TENANT, p.clientId, p.petId, p.staffId, p.serviceType, p.start, p.end, p.booking],
      );
      if (!res.insertId) throw new Error(`insert produced no row for ${p.petName}`);
      written++;
      // Trap 10: so the next sync matches by id. Guarded, so a client
      // who gained an id meanwhile is left alone.
      if (p.backfillMoegoId) {
        await c.query(
          "UPDATE clients SET moego_client_id=? WHERE id=? AND moego_client_id IS NULL",
          [p.moegoClientId, p.clientId],
        );
      }
    }
    if (written !== plan.length) throw new Error(`expected ${plan.length} inserts, made ${written}`);
    console.log(`\nrows written: ${written} of ${plan.length}`);
    if (APPLY) { await c.commit(); console.log("Committed."); }
    else { await c.rollback(); console.log("DRY RUN — rolled back. Re-run with --apply."); }
  } catch (e) {
    await c.rollback();
    console.error("ROLLED BACK —", e.message);
    process.exitCode = 1;
  }
  await c.end();
})();

/**
 * The Monday sync for 02/11/2026.
 *
 * Seven changes, from the divergence report over 02/11 - 23/11. MoeGo
 * held 317 bookings (397 dogs) against Groomigo's 400 live rows.
 *
 * Written fresh for this run, as every sync is until an importer
 * exists. Dry run by default; --apply runs the lot in ONE transaction
 * and rolls back whole if any count is not exactly what is expected.
 *
 *   corepack pnpm exec tsx scripts/moego-sync-2026-11-02.ts
 *   corepack pnpm exec tsx scripts/moego-sync-2026-11-02.ts --apply
 *
 * RE-PULL MOEGO IMMEDIATELY BEFORE RUNNING WITH --apply. A booking
 * cancelled last night is invisible to a pull taken this morning, and
 * that has happened twice (Trap 6).
 *
 * What it does NOT do, on purpose:
 *
 *   - Jackson (Lynnette Matuschka, 17/11) and Chloe (Elizabeth Bell,
 *     13/11) are extra dogs on bookings MoeGo lists with fewer pets.
 *     Either the salon added a dog in Groomigo or the rows are stale,
 *     and nothing here can tell which. A human looks at those.
 *   - Sam (Peter Bell, 03/11) is on the board tomorrow and MoeGo has
 *     Upcoming (0) for him. Absence is not deletion (Trap 7), and
 *     03/11 is close enough that guessing is the expensive option.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

/** Brisbane is UTC+10 with no DST, so a local wall time is a fixed offset. */
const utc = (local: string) => {
  const d = new Date(`${local}+10:00`);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

type Row = Record<string, any>;

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const one = async (sql: string, p: any[] = []): Promise<Row | null> => {
    const [r]: any = await c.query(sql, p);
    return r[0] ?? null;
  };
  const say = (s: string) => console.log(s);

  // ── Pre-flight: assert every row is exactly as the report found it ─────
  // If any of these fail, the board moved since the pull and the whole
  // run is abandoned rather than applied to a different world.
  const checks: Array<[string, Row | null, (r: Row | null) => boolean]> = [];

  const amber = await one(
    `SELECT id, workflow_state ws, moego_appointment_id mid FROM appointments
      WHERE id=2640005 AND tenant_id=?`, [TENANT]);
  checks.push(["Amber 2640005 still scheduled", amber,
    (r) => !!r && r.ws === "scheduled" && String(r.mid) === "134736792"]);

  const raffStale = await one(
    `SELECT id, workflow_state ws, DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d
       FROM appointments WHERE id=1200529 AND tenant_id=?`, [TENANT]);
  checks.push(["Raff 1200529 still on 06/11", raffStale,
    (r) => !!r && r.ws === "scheduled" && r.d === "2026-11-06"]);

  const raffKeep = await one(
    `SELECT id, workflow_state ws, DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d
       FROM appointments WHERE id=2580021 AND tenant_id=?`, [TENANT]);
  checks.push(["Raff 2580021 still on 11/11 (the one we keep)", raffKeep,
    (r) => !!r && r.ws === "scheduled" && r.d === "2026-11-11"]);

  const leo = await one(
    `SELECT id, workflow_state ws, pet_id, client_id FROM appointments
      WHERE id=1200704 AND tenant_id=?`, [TENANT]);
  checks.push(["Leo 1200704 still cancelled", leo, (r) => !!r && r.ws === "cancelled"]);

  // Trap 5: reinstating is only safe if the pet is free that day.
  const leoClash = await one(
    `SELECT COUNT(*) n FROM appointments
      WHERE pet_id=? AND id<>1200704 AND tenant_id=?
        AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))='2026-11-04'
        AND workflow_state NOT IN ('cancelled','no_show')`, [leo?.pet_id, TENANT]);
  checks.push(["Leo has nothing else on 04/11", leoClash, (r) => !!r && Number(r.n) === 0]);

  const edward = await one(
    `SELECT id, moego_appointment_id mid, workflow_state ws FROM appointments
      WHERE id=2460002 AND tenant_id=?`, [TENANT]);
  checks.push(["Edward 2460002 still has no booking id", edward,
    (r) => !!r && r.mid === null && r.ws === "scheduled"]);

  const ralph = await one(
    `SELECT id, moego_appointment_id mid, workflow_state ws FROM appointments
      WHERE id=2670002 AND tenant_id=?`, [TENANT]);
  checks.push(["Ralph 2670002 still has no booking id", ralph,
    (r) => !!r && r.mid === null && r.ws === "scheduled"]);

  const rommy = await one(
    `SELECT id, workflow_state ws, DATE_FORMAT(CONVERT_TZ(scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') d
       FROM appointments WHERE id=1200665 AND tenant_id=?`, [TENANT]);
  checks.push(["Rommy 1200665 still on 05/11", rommy,
    (r) => !!r && r.ws === "scheduled" && r.d === "2026-11-05"]);

  // Trap 5 again, for the create: look for ANY row for this pet that day,
  // whatever its booking id or state.
  const maggieClash = await one(
    `SELECT COUNT(*) n FROM appointments
      WHERE pet_id=179 AND tenant_id=?
        AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))='2026-11-13'`, [TENANT]);
  checks.push(["Maggie has nothing at all on 13/11", maggieClash,
    (r) => !!r && Number(r.n) === 0]);

  const maggiePet = await one(
    `SELECT p.id, p.name, p.client_id FROM pets p WHERE p.id=179 AND p.tenant_id=?`, [TENANT]);
  checks.push(["Maggie is pet 179 of client 82", maggiePet,
    (r) => !!r && r.name === "Maggie" && Number(r.client_id) === 82]);

  const dupId = await one(
    `SELECT COUNT(*) n FROM appointments
      WHERE moego_appointment_id IN ('137745384','138526103') AND tenant_id=?`, [TENANT]);
  checks.push(["Neither backfilled booking id is already in use", dupId,
    (r) => !!r && Number(r.n) === 0]);

  console.log("PRE-FLIGHT");
  let ok = true;
  for (const [label, row, test] of checks) {
    const pass = test(row);
    if (!pass) ok = false;
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}`);
  }
  if (!ok) {
    console.error("\nABORTED — the board has moved since the report. Re-run the sync report.");
    await c.end();
    process.exit(1);
  }

  console.log("\nPLAN");
  say("  1. CANCEL  Amber (Colleen Du toit) 06/11 — MoeGo cancelled it 02/11, 'reply N to cancel'");
  say("  2. CANCEL  Raff (Melinda Collinge) 06/11 appt 1200529 — duplicate; MoeGo has this booking on 11/11");
  say("  3. REVIVE  Leo (Tarica Aujla) cancelled 21/10 -> scheduled 04/11 09:30-11:30, Brooklyn");
  say("  4. MOVE    Rommy (Kate Lovell) 05/11 08:00 -> 04/11 07:30 (90 min kept)");
  say("  5. LINK    Edward (David Jones) 04/11 -> booking 137745384");
  say("  6. LINK    Ralph (Sam Evans) 05/11 -> booking 138526103");
  say("  7. CREATE  Maggie (Ruth Weaver) 13/11 07:30-12:00 daycare half day, Lauren, price NULL");

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    await c.end();
    return;
  }

  const expect = (got: number, want: number, what: string) => {
    if (got !== want) throw new Error(`${what}: affected ${got}, expected ${want}`);
  };
  const audit = async (apptId: number, from: string | null, to: string, note: string) => {
    const [r]: any = await c.query(
      `INSERT INTO workflow_logs (appointment_id, from_state, to_state, changed_at, notes)
       VALUES (?,?,?,NOW(),?)`, [apptId, from, to, note]);
    expect(r.affectedRows, 1, `workflow_logs for ${apptId}`);
  };

  await c.beginTransaction();
  try {
    // 1 & 2 — cancellations. Both columns set, both guarded on scheduled.
    for (const [id, note] of [
      [2640005, "MoeGo sync 02/11/2026: cancelled in MoeGo on 02/11, reason 'reply N to cancel'."],
      [1200529, "MoeGo sync 02/11/2026: duplicate of appt 2580021. MoeGo booking 124938374 is on 11/11."],
    ] as Array<[number, string]>) {
      const [r]: any = await c.query(
        `UPDATE appointments SET workflow_state='cancelled', status='cancelled'
          WHERE id=? AND tenant_id=? AND workflow_state='scheduled'`, [id, TENANT]);
      expect(r.affectedRows, 1, `cancel ${id}`);
      await audit(id, "scheduled", "cancelled", note);
    }

    // 3 — revive and move Leo. cancelled -> scheduled is allowed here only
    // because the row is in the PAST and MoeGo has revived the booking;
    // see Trap 5. Status goes back to pending, like every imported row.
    {
      const [r]: any = await c.query(
        `UPDATE appointments
            SET workflow_state='scheduled', status='pending',
                scheduled_start=?, scheduled_end=?
          WHERE id=1200704 AND tenant_id=? AND workflow_state='cancelled'`,
        [utc("2026-11-04T09:30"), utc("2026-11-04T11:30"), TENANT]);
      expect(r.affectedRows, 1, "revive Leo 1200704");
      await audit(1200704, "cancelled", "scheduled",
        "MoeGo sync 02/11/2026: MoeGo booking 128696967 is live on 04/11; reinstated and moved from 21/10.");
    }

    // 4 — move Rommy. No state change, so no workflow_logs row: nothing
    // moved through the machine.
    {
      const [r]: any = await c.query(
        `UPDATE appointments SET scheduled_start=?, scheduled_end=?
          WHERE id=1200665 AND tenant_id=? AND workflow_state='scheduled'`,
        [utc("2026-11-04T07:30"), utc("2026-11-04T09:00"), TENANT]);
      expect(r.affectedRows, 1, "move Rommy 1200665");
    }

    // 5 & 6 — backfill the booking ids, guarded on still-NULL so a
    // concurrent sync cannot be overwritten.
    for (const [id, mid] of [[2460002, "137745384"], [2670002, "138526103"]] as Array<[number, string]>) {
      const [r]: any = await c.query(
        `UPDATE appointments SET moego_appointment_id=?
          WHERE id=? AND tenant_id=? AND moego_appointment_id IS NULL`, [mid, id, TENANT]);
      expect(r.affectedRows, 1, `link ${id} -> ${mid}`);
    }

    // 7 — create Maggie's daycare. price and gross_price NULL: MoeGo's
    // $45 is the BOOKING total and this sync does not set fees.
    // reminder_* left NULL so it behaves like any real upcoming booking.
    {
      const [r]: any = await c.query(
        `INSERT INTO appointments
           (tenant_id, client_id, pet_id, staff_id, service_type,
            scheduled_start, scheduled_end, workflow_state, status,
            moego_appointment_id, price, gross_price, notes)
         VALUES (?,?,?,?,?,?,?,'scheduled','pending',?,NULL,NULL,?)`,
        [TENANT, 82, 179, 1, "daycare",
         utc("2026-11-13T07:30"), utc("2026-11-13T12:00"),
         "138484049",
         "Created from MoeGo by the sync on 02/11/2026. Day Care 1/2 day session (7:30am-12pm)."]);
      expect(r.affectedRows, 1, "create Maggie");
      await audit(r.insertId, null, "scheduled",
        "MoeGo sync 02/11/2026: created from MoeGo booking 138484049.");
    }

    // ── Post-conditions, inside the transaction ────────────────────────
    const noDoubleBook = await one(
      `SELECT COUNT(*) n FROM (
         SELECT pet_id, DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00')) d, COUNT(*) k
           FROM appointments
          WHERE tenant_id=? AND workflow_state NOT IN ('cancelled','no_show')
            AND DATE(CONVERT_TZ(scheduled_start,'+00:00','+10:00'))
                BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 21 DAY)
          GROUP BY pet_id, d HAVING k > 1) x`, [TENANT]);
    if (Number(noDoubleBook!.n) !== 0) {
      throw new Error(`${noDoubleBook!.n} pet(s) booked twice on one day — rolling back`);
    }

    await c.commit();
    console.log("\ncommitted — 7 changes, no pet booked twice in the window");
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    await c.end();
    process.exit(1);
  }
  await c.end();
})();

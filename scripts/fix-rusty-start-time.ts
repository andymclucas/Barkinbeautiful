/**
 * Rusty (Hazel Martin) is on the board for 1:30 in the morning.
 *
 * Andy, 09/11/2026: "Fix Rusty's time."
 *
 * Appointment 2640155, MoeGo booking 136232639, Wednesday 11 November:
 *
 *                     start                end             blocked
 *   Groomigo had      Wed 11 Nov 1:30 AM   Wed 11 Nov 4:00 PM   870 min
 *   MoeGo says        Wed 11 Nov 1:00 PM   Wed 11 Nov 2:30 PM    90 min
 *
 * ## Both ends were wrong, and the end was the less obvious one
 *
 * 1:30 AM is plainly wrong — it is the only upcoming booking in the
 * whole salon starting before 6am, which is how it was found. The end
 * is not obviously wrong at all: 4:00 PM is a perfectly ordinary time
 * of day, and only the 870-minute span between them gives it away.
 *
 * ## Read off MoeGo, not worked out
 *
 * It was tempting to treat 1:30 AM as a twelve-hour flip and write
 * 1:30 PM. MoeGo's Appointment schedules report for 11/11/2026 says
 * **01:00 PM**, and its calendar agenda says **01:00 pm - 02:30 pm**.
 * The guess would have been half an hour out on a real client's
 * Wednesday.
 *
 * The 90 minutes that falls out of those two is also what the salon
 * actually does with this dog: Loui is the same 9kg small dog, the same
 * styled groom, with the same groomer, on the same day — 9:00 to 10:30.
 * So the figure agrees with the board as well as with MoeGo.
 *
 * (getAutoDurationMinutes would have said 60 for a small dog. It does
 * not distinguish a styled groom from a classic one. Another reason not
 * to derive a time that can simply be looked up.)
 *
 * ## What it does NOT do
 *
 * It does not text Hazel. A direct UPDATE runs no application code, so
 * nothing is enqueued — and by the salon's own rule only a change of
 * DAY is worth a text, which this is not: the booking was always
 * Wednesday.
 *
 * She has in fact been told "1:30 am" twice, on the 7th and the 9th,
 * and replied Y to both. The correction reaches her by itself: the
 * morning-of reminder runs at 6:30 on Wednesday, `reminder_morning_sent_at`
 * is still NULL, and it will read "today at 1:00 pm".
 *
 * It also does not write a workflow_logs row. That table records
 * movements through the 12-state machine, and this booking stays
 * `scheduled` throughout — it is a correction to when, not a change of
 * what.
 *
 *   node --import tsx scripts/fix-rusty-start-time.ts            # dry run
 *   node --import tsx scripts/fix-rusty-start-time.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mkdirSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const APPOINTMENT_ID = 2640155;

/* Brisbane is UTC+10 with no DST, so these are fixed shifts:
   1:00 PM -> 03:00 UTC, 2:30 PM -> 04:30 UTC, both on the 11th. */
const WAS_START = "2026-11-10 15:30:00";
const WAS_END = "2026-11-11 06:00:00";
const NEW_START = "2026-11-11 03:00:00";
const NEW_END = "2026-11-11 04:30:00";

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });

  console.log(APPLY ? "\nMODE: APPLY — this writes\n" : "\nMODE: dry run — nothing is written\n");

  const [rows]: any = await db.query(
    `SELECT a.id, a.moego_appointment_id AS moego, p.name AS dog,
            CONCAT(c.first_name,' ',c.last_name) AS client,
            DATE_FORMAT(a.scheduled_start, '%Y-%m-%d %H:%i:%s') AS startUtc,
            DATE_FORMAT(a.scheduled_end,   '%Y-%m-%d %H:%i:%s') AS endUtc,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'), '%a %d %b %l:%i %p') AS startBris,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_end,  '+00:00','+10:00'), '%a %d %b %l:%i %p') AS endBris,
            TIMESTAMPDIFF(MINUTE, a.scheduled_start, a.scheduled_end) AS mins,
            a.workflow_state AS state
       FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       JOIN clients c ON c.id = a.client_id
      WHERE a.id = ? AND a.tenant_id = ?`, [APPOINTMENT_ID, TENANT]);

  const row = rows[0];
  if (!row) { console.log(`Appointment ${APPOINTMENT_ID} not found on tenant ${TENANT}. Nothing to do.`); await db.end(); return; }

  console.log(`${row.dog} (${row.client}) — MoeGo ${row.moego}, appointment ${row.id}`);
  console.log(`  now:    ${row.startBris}  ->  ${row.endBris}   (${row.mins} minutes)`);
  console.log(`  MoeGo:  Wed 11 Nov 1:00 PM  ->  Wed 11 Nov 2:30 PM   (90 minutes)`);

  /* Everything below refuses rather than guesses. Somebody may have
     fixed this by hand between the read and the run, and overwriting
     their correction with a stale one is worse than doing nothing. */
  if (row.startUtc === NEW_START && row.endUtc === NEW_END) {
    console.log("\nAlready correct. Nothing to do."); await db.end(); return;
  }
  if (row.startUtc !== WAS_START || row.endUtc !== WAS_END) {
    console.log(`\nThis row is not in the state this script was written for.`);
    console.log(`  expected start ${WAS_START} / end ${WAS_END}`);
    console.log(`  found    start ${row.startUtc} / end ${row.endUtc}`);
    console.log("Somebody has changed it. Look before writing anything.");
    process.exitCode = 1; await db.end(); return;
  }
  if (row.state !== "scheduled") {
    // The same rule the MoeGo sync works to: never touch a dog that is
    // on the floor.
    console.log(`\nThe dog is at ${row.state}, not scheduled. Leaving it alone.`);
    process.exitCode = 1; await db.end(); return;
  }

  if (!APPLY) { console.log("\nDry run. Re-run with --apply to correct it."); await db.end(); return; }

  mkdirSync("scripts/out", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reversal = `scripts/out/rusty-time-${stamp}.json`;
  writeFileSync(reversal, JSON.stringify({
    ranAt: new Date().toISOString(),
    note: "Times before the correction. Nothing else records them.",
    appointmentId: row.id, previousStartUtc: row.startUtc, previousEndUtc: row.endUtc,
    newStartUtc: NEW_START, newEndUtc: NEW_END,
  }, null, 2));
  console.log(`\nReversal written to ${reversal}`);

  /* The WHERE re-states the times actually read, so a concurrent change
     makes this a no-op rather than an overwrite. No `<=>` needed:
     scheduled_start and scheduled_end are both NOT NULL. */
  const [res]: any = await db.query(
    `UPDATE appointments
        SET scheduled_start = ?, scheduled_end = ?, updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ?
        AND scheduled_start = ? AND scheduled_end = ?
        AND workflow_state = 'scheduled'`,
    [NEW_START, NEW_END, APPOINTMENT_ID, TENANT, WAS_START, WAS_END]);

  if (res.affectedRows === 1) {
    console.log(`\nCorrected. ${row.dog} is now Wed 11 Nov 1:00 PM – 2:30 PM.`);
    console.log("No text was sent. The 6:30am reminder on Wednesday will say 1:00 pm.");
  } else {
    console.log(`\nWrote ${res.affectedRows} rows — expected 1. The row changed between the read and the write; re-run.`);
    process.exitCode = 1;
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

/**
 * Cancel Tanya Leek's duplicate 12:30 booking on Thu 14 Jan 2027.
 *
 * Andy, 09/11/2026: keep 11:30, cancel 12:30.
 *
 * She has TWO live bookings for Bonnie and Chester that day and has
 * confirmed both by text:
 *
 *   06/11 10:16  12:30pm  styled_groom  $163 ea  Ashleigh + Megs  <- goes
 *   09/11 09:10  11:30am  classic_groom $145 ea  Brooklyn + Megs  <- stays
 *
 * Somebody booked again on the 9th instead of moving the booking made on
 * the 6th. The second confirmation went out, the first booking stayed on
 * the board, and she said yes to both.
 *
 * WHY A SCRIPT AND NOT THE CANCEL BUTTON
 *
 * "cancellation" is on the allow-list in shared/automatedSms.ts, so
 * cancelling in the app texts her "...on Thursday 14 January at 12:30 pm
 * has been cancelled. Call us any time to rebook." She does not need to
 * rebook -- she has 11:30 -- and there is no way to suppress it: the
 * cancel path takes no flag, and decideCancellationSms has no "does this
 * client still have a booking that day" check. The reschedule path has
 * exactly that check (clientToldOfDayAt); the cancellation path does not.
 *
 * A direct SQL write runs no application code, so this sends nothing.
 * Send her ONE accurate text afterwards from Messages instead -- wording
 * at the bottom of this file.
 *
 * Guards, per the Trap 4 rules in .claude/skills/moego-monday-sync:
 *   - one transaction, rolled back whole on any surprise
 *   - WHERE pins the client AND the scheduled time AND workflow_state
 *   - aborts unless EXACTLY 2 rows change
 *   - sets workflow_state AND status, which must never disagree
 *   - writes the workflow_logs audit rows
 *
 * cancellation_sms_sent_at is deliberately left NULL. Setting it would
 * claim a text that was never sent, and this file's whole point is that
 * no text goes out from here.
 *
 *   corepack pnpm exec tsx scripts/cancel-leek-duplicate-14jan.ts
 *   corepack pnpm exec tsx scripts/cancel-leek-duplicate-14jan.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const CLIENT_ID = 638;
const IDS = [2820004, 2820005] as const; // Chester, Bonnie -- the 12:30 pair
const KEEP = [2910004, 2910005] as const; // the 11:30 pair, untouched
const APPLY = process.argv.includes("--apply");

async function main() {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });
  const bne = (col: string) =>
    `DATE_FORMAT(CONVERT_TZ(${col},"+00:00","+10:00"),"%a %d/%m/%Y %H:%i")`;

  const [rows] = await c.query<any[]>(
    `SELECT a.id, p.name pet, ${bne("a.scheduled_start")} start, a.service_type,
            a.price, a.workflow_state, a.status, a.payment_status,
            (SELECT COUNT(*) FROM appointment_add_ons x WHERE x.appointment_id = a.id) add_ons
       FROM appointments a JOIN pets p ON p.id = a.pet_id
      WHERE a.id IN (?) AND a.client_id = ?`,
    [[...IDS, ...KEEP], CLIENT_ID],
  );
  console.log("\nCurrent state:");
  console.table(rows);

  const targets = rows.filter((r) => (IDS as readonly number[]).includes(r.id));
  if (targets.length !== 2) {
    throw new Error(`expected 2 target rows, found ${targets.length} -- stopping`);
  }
  const notScheduled = targets.filter((r) => r.workflow_state !== "scheduled");
  if (notScheduled.length) {
    // A dog past "scheduled" is at the salon. Never cancel one from here.
    throw new Error(
      `not scheduled any more: ${notScheduled.map((r) => `${r.id}=${r.workflow_state}`).join(", ")} -- stopping`,
    );
  }
  const withAddOns = targets.filter((r) => Number(r.add_ons) > 0);
  if (withAddOns.length) {
    console.log(
      `NOTE: ${withAddOns.map((r) => `${r.id} has ${r.add_ons} add-on line(s)`).join("; ")}.` +
        " Cancelling leaves them attached to a cancelled booking, which is what the app does too.",
    );
  }

  if (!APPLY) {
    console.log(
      `\nDRY RUN. Would cancel ${IDS.join(", ")} (the 12:30 pair) and leave ${KEEP.join(", ")} alone.` +
        "\nNo text is sent either way. Re-run with --apply.\n",
    );
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    const [res] = await c.query<any>(
      `UPDATE appointments
          SET workflow_state = "cancelled", status = "cancelled"
        WHERE id IN (?) AND client_id = ? AND workflow_state = "scheduled"`,
      [[...IDS], CLIENT_ID],
    );
    const changed = Number(res.affectedRows ?? 0);
    if (changed !== 2) {
      throw new Error(`expected to change 2 rows, changed ${changed} -- rolling back`);
    }
    await c.query(
      `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes)
       VALUES (?, "scheduled", "cancelled", ?), (?, "scheduled", "cancelled", ?)`,
      [
        IDS[0], "Duplicate 14 Jan booking removed; 11:30 booking stands. No client text sent from here.",
        IDS[1], "Duplicate 14 Jan booking removed; 11:30 booking stands. No client text sent from here.",
      ],
    );
    await c.commit();
    console.log(`\nCancelled ${changed} rows. Nothing was texted.`);
  } catch (err) {
    await c.rollback();
    console.error("\nRolled back:", err);
    process.exitCode = 1;
  }

  const [after] = await c.query<any[]>(
    `SELECT a.id, p.name pet, ${bne("a.scheduled_start")} start, a.workflow_state, a.status
       FROM appointments a JOIN pets p ON p.id = a.pet_id
      WHERE a.id IN (?) ORDER BY a.scheduled_start`,
    [[...IDS, ...KEEP]],
  );
  console.log("\nAfter:");
  console.table(after);
  console.log(
    "\nNow send her ONE text from Messages, e.g.:\n" +
      '  "Hi Tanya, just tidying up our end - Bonnie and Chester are booked in\n' +
      '   for Thursday 14 January at 11:30am. The 12:30 slot was a duplicate on\n' +
      '   our side and has been removed. Nothing to do, see you then!"\n',
  );
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

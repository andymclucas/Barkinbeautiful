/**
 * Move Minnie Condon to 12:00 on Wednesday 11 November, beside Molly.
 *
 * Andy, 09/11/2026: "Move Minnie to 12pm".
 *
 * Kate has been told midday twice and has said so twice ("They are both
 * booked in for 12 midday", 07/11). Molly is already at 12:00. Minnie's
 * row is still 08:00, which is what both reminders correctly quoted.
 *
 * ## No text goes out, and that is right
 *
 * A direct SQL write runs no application code, so nothing is sent. Even
 * through the app this would be silent: a reschedule text only goes when
 * the DAY changes, and this is the same day. Kate already expects 12:00,
 * so a text would only confuse her.
 *
 * The 4-day and 2-day reminder claims are deliberately LEFT SET. They
 * record that those texts were sent, which they were. Clearing them
 * would make the day-before reminder treat this as un-reminded and is
 * not what the columns mean. The day-before reminder has not run yet and
 * will read the new time.
 *
 * ## The duration
 *
 * Minnie keeps her own hour: 12:00-13:00. Molly's row reads 12:00-16:00,
 * which is the combined block the old one-row-per-booking import wrote,
 * not Molly's own groom. Stretching Minnie to match would double-count
 * it. If the pair really needs a longer block, that is a question for
 * the diary, not for this fix.
 *
 * Guards: one transaction, the WHERE pins the id AND the client AND the
 * current 08:00 start AND the state, and it aborts unless exactly one
 * row changes.
 *
 *   corepack pnpm exec tsx scripts/move-minnie-to-noon-2026-11-11.ts
 *   corepack pnpm exec tsx scripts/move-minnie-to-noon-2026-11-11.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const APPT = 2580020;         // Minnie
const CLIENT = 78;            // Kate Condon
const FROM_UTC = "2026-11-10 22:00:00"; // Wed 11/11 08:00 Brisbane
const TO_UTC = "2026-11-11 02:00:00";   // Wed 11/11 12:00 Brisbane
const TO_END_UTC = "2026-11-11 03:00:00"; // keeps her own hour

async function main() {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });
  const bne = (col: string) =>
    `DATE_FORMAT(CONVERT_TZ(${col},"+00:00","+10:00"),"%a %d/%m %H:%i")`;

  const show = async (label: string) => {
    const [rows] = await c.query<any[]>(
      `SELECT a.id, p.name pet, ${bne("a.scheduled_start")} start,
              ${bne("a.scheduled_end")} end, a.workflow_state, a.status, s.name staff
         FROM appointments a JOIN pets p ON p.id = a.pet_id
         LEFT JOIN staff s ON s.id = a.staff_id
        WHERE a.client_id = ? AND a.session_id = "2V5BQiKET27AysGq"
        ORDER BY a.scheduled_start`,
      [CLIENT],
    );
    console.log(`\n${label}`);
    console.table(rows);
    return rows;
  };

  const before = await show("Before:");
  const minnie = before.find((r) => r.id === APPT);
  if (!minnie) throw new Error(`appointment ${APPT} is not on this booking any more -- stopping`);
  if (!minnie.start.endsWith("08:00")) {
    console.log(`Minnie is already at ${minnie.start}. Nothing to do.`);
    await c.end();
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN. Would move Minnie to Wed 11/11 12:00-13:00, beside Molly.");
    console.log("No text is sent either way. Re-run with --apply.\n");
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    const [res] = await c.query<any>(
      `UPDATE appointments
          SET scheduled_start = ?, scheduled_end = ?
        WHERE id = ? AND client_id = ?
          AND scheduled_start = ?
          AND workflow_state = "scheduled"`,
      [TO_UTC, TO_END_UTC, APPT, CLIENT, FROM_UTC],
    );
    const changed = Number(res.affectedRows ?? 0);
    if (changed !== 1) {
      throw new Error(`expected to move 1 row, moved ${changed} -- rolling back`);
    }
    await c.commit();
    console.log(`\nMoved. Nothing was texted.`);
  } catch (err) {
    await c.rollback();
    console.error("\nRolled back:", err);
    process.exitCode = 1;
  }

  await show("After:");
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

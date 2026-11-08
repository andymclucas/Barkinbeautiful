/**
 * Mark bookings confirmed where the client already texted back Y.
 *
 * Andy, 09/11/2026, the night before the salon runs entirely on
 * Groomigo: "Do a current scan of all the texts that have come back for
 * ones that have been accepted and mark them as so."
 *
 *   node --import tsx scripts/apply-confirm-replies.ts            # dry run
 *   node --import tsx scripts/apply-confirm-replies.ts --apply    # writes
 *
 * ## Why there is a backlog at all
 *
 * The Y/N prompt went on the automated texts on 06/11/2026 and, by
 * Andy's instruction then, only an N acted by itself — a Y recorded an
 * intent for staff to action with one tap. 97 of those taps were never
 * made, because while MoeGo held the diary the badge did not matter.
 * From tomorrow it does: it is how staff know who is actually coming.
 *
 * ## It confirms the BOOKING, not the row the reply was logged against
 *
 * sms_logs stores only the lead appointment's id, but one reminder
 * covers a family booking. Confirming the lead alone leaves the second
 * dog pending — on this backlog that is 19 dogs of 102. The decision
 * resolves to every appointment in the booking, the same way the
 * automatic cancellation already does, and the rule lives in
 * shared/inboundReplyAction.ts so the two cannot drift.
 *
 * ## What it refuses
 *
 * Confirming adds information and takes nobody off the board, so the
 * refusals exist to keep the badge TRUE rather than to prevent harm:
 * a booking already cancelled, already started, or with the dog already
 * checked in is not something a Y should restate.
 *
 * A reply is marked processed either way. `processed_by_user_id` stays
 * null, which is how the Messages thread already tells an automatic
 * action from one a person took.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mkdirSync, writeFileSync } from "node:fs";
import { decideConfirmAction, describeReplyRefusal } from "../shared/inboundReplyAction";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
    connectTimeout: 20_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
  });

  console.log(APPLY ? "\nMODE: APPLY — this writes\n" : "\nMODE: dry run — nothing is written\n");

  // Every unactioned Y, with the outbound text it answers so the age
  // window can be applied, and the lead appointment it was logged against.
  const [replies]: any = await db.query(
    `SELECT s.id, s.client_id, s.appointment_id, s.sent_at AS receivedAt, s.body,
            CONCAT(c.first_name, ' ', c.last_name) AS client,
            (SELECT MAX(o.sent_at) FROM sms_logs o
              WHERE o.tenant_id = s.tenant_id AND o.client_id = s.client_id
                AND o.direction = 'outbound' AND o.sent_at <= s.sent_at) AS matchedAt
       FROM sms_logs s
       LEFT JOIN clients c ON c.id = s.client_id
      WHERE s.tenant_id = ? AND s.direction = 'inbound'
        AND s.reply_intent = 'confirm' AND s.processed_at IS NULL
      ORDER BY s.sent_at`, [TENANT]);

  console.log(`Unactioned "Y" replies: ${replies.length}`);

  const toConfirm = new Map<number, { client: string; whenIs: string }>();
  const processedReplyIds: number[] = [];
  const refused: Record<string, number> = {};

  for (const r of replies) {
    if (!r.appointment_id) { refused["no booking on the reply"] = (refused["no booking on the reply"] ?? 0) + 1; continue; }

    // The whole booking: same client, same start. groupRemindersByBooking
    // uses exactly this pairing to decide what one text covers.
    const [booking]: any = await db.query(
      `SELECT sib.id, sib.status, sib.workflow_state AS workflowState, sib.scheduled_start AS scheduledStart
         FROM appointments hd
         JOIN appointments sib ON sib.client_id = hd.client_id
                              AND sib.scheduled_start = hd.scheduled_start
                              AND sib.tenant_id = hd.tenant_id
        WHERE hd.id = ? AND hd.tenant_id = ?`, [r.appointment_id, TENANT]);

    const decision = decideConfirmAction({
      intent: "confirm",
      matchedMessageSentAt: r.matchedAt ? new Date(r.matchedAt) : null,
      bookingAppointments: booking.map((b: any) => ({
        id: b.id, status: String(b.status),
        workflowState: String(b.workflowState),
        scheduledStart: new Date(b.scheduledStart),
      })),
      receivedAt: new Date(r.receivedAt),
    });

    if (!decision.act) {
      const label = describeReplyRefusal(decision.reason);
      refused[label] = (refused[label] ?? 0) + 1;
      // Still mark it read: leaving it unactioned means it is offered
      // again tomorrow and refused again for the same reason.
      processedReplyIds.push(r.id);
      continue;
    }

    const whenIs = new Date(booking[0].scheduledStart).toLocaleString("en-AU", {
      timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
    for (const id of decision.appointmentIds) {
      toConfirm.set(id, { client: r.client ?? `client ${r.client_id}`, whenIs });
    }
    processedReplyIds.push(r.id);
  }

  console.log(`\nAppointments to mark confirmed: ${toConfirm.size}`);
  if (Object.keys(refused).length > 0) {
    console.log("\nLeft alone:");
    for (const [why, n] of Object.entries(refused)) {
      console.log(`  ${String(n).padStart(4)}  ${why}`);
    }
  }

  const sample = [...toConfirm.entries()].slice(0, 12);
  if (sample.length > 0) {
    console.log("\nFirst 12:");
    for (const [id, v] of sample) {
      console.log(`  appt ${String(id).padStart(8)}  ${v.client.padEnd(24)} ${v.whenIs}`);
    }
  }

  if (toConfirm.size === 0 && processedReplyIds.length === 0) {
    console.log("\nNothing to do.");
    await db.end();
    return;
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these.");
    await db.end();
    return;
  }

  mkdirSync("scripts/out", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reversal = `scripts/out/confirmed-replies-${stamp}.json`;
  writeFileSync(reversal, JSON.stringify({
    ranAt: new Date().toISOString(),
    note: "Appointments moved pending -> confirmed, and the replies marked processed.",
    appointmentIds: [...toConfirm.keys()],
    replyIds: processedReplyIds,
  }, null, 2));
  console.log(`\nReversal written to ${reversal}`);

  await db.beginTransaction();
  try {
    let confirmed = 0;
    const ids = [...toConfirm.keys()];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      // `status = 'pending'` repeated at the write: a booking somebody
      // has cancelled since it was read is left alone rather than
      // confirmed on stale information.
      const [res]: any = await db.query(
        `UPDATE appointments SET status = 'confirmed'
          WHERE tenant_id = ? AND status = 'pending'
            AND workflow_state = 'scheduled'
            AND id IN (${batch.map(() => "?").join(",")})`,
        [TENANT, ...batch]);
      confirmed += res.affectedRows;
    }
    if (confirmed > ids.length) throw new Error(`confirmed ${confirmed} for ${ids.length} — rolling back`);

    for (let i = 0; i < processedReplyIds.length; i += 200) {
      const batch = processedReplyIds.slice(i, i + 200);
      await db.query(
        `UPDATE sms_logs SET processed_at = UTC_TIMESTAMP(), review_action = 'confirm'
          WHERE tenant_id = ? AND id IN (${batch.map(() => "?").join(",")})`,
        [TENANT, ...batch]);
    }

    await db.commit();
    console.log(`\nConfirmed ${confirmed} appointment(s); ${processedReplyIds.length} reply(ies) marked read.`);
    if (confirmed < ids.length) {
      console.log(`${ids.length - confirmed} were skipped at the write because they had changed since being read.`);
    }
  } catch (error) {
    await db.rollback();
    console.error("Rolled back:", (error as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

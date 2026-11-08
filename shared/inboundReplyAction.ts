/**
 * What a client's "N" to a reminder is allowed to do on its own.
 *
 * Andy, 06/11/2026: add a Y/N prompt to the automated texts, and "only
 * changes if N response is received". So a Y records an intent for staff
 * to action with one tap, exactly as it does today, and an N can cancel
 * the booking by itself.
 *
 * ## Why N and not Y, which is the opposite of the obvious
 *
 * A confirmation changes nothing operationally — the booking already
 * exists and is already going ahead, so auto-confirming saves the salon a
 * tap and nothing else. A cancellation is information the board needs
 * within minutes: it frees a slot somebody on the waitlist wants, and a
 * groomer standing waiting for a dog that is not coming is the cost of
 * finding out late.
 *
 * ## It cancels the BOOKING, not the row the text was logged against
 *
 * One reminder covers a whole booking — groupRemindersByBooking groups by
 * (client, start), so "Bella and Max's grooming appointment" is one text
 * — but smsLogs stores only the LEAD appointment's id. Cancelling that
 * one id would take Bella off the board and leave Max on it, for a client
 * who told us neither was coming. So the decision resolves to every
 * appointment in that booking.
 *
 * ## What it refuses to do
 *
 * An automatic cancellation removes a dog from the salon's board on the
 * strength of one letter, and "N" is also how somebody answers a question
 * we did not realise we had asked. So it acts only when the match is
 * unambiguous and refuses the moment it is not — every refusal still
 * reaches Messages as a one-tap staff review, so nothing is lost, it just
 * waits for a person.
 */

export type ReplyIntent = "confirm" | "cancel" | "unknown";

export type ReplyCandidate = {
  id: number;
  /** The 12-state workflow value. */
  workflowState: string;
  /** confirmed | pending | cancelled | no_show */
  status: string;
  scheduledStart: Date;
};

export type ReplyActionDecision =
  | { act: true; appointmentIds: number[] }
  | { act: false; reason: ReplyActionRefusal };

export type ReplyActionRefusal =
  /** Y, or anything we did not recognise. Only N cancels by itself. */
  | "not_a_cancellation"
  /** N, or anything we did not recognise, where a confirm was expected. */
  | "not_a_confirmation"
  /** No outbound reminder or confirmation to tie the reply to. */
  | "no_matching_message"
  /** The reply came long after the text it would be answering. */
  | "message_too_old"
  /** Nothing left to cancel. */
  | "already_cancelled"
  /** In the past; cancelling history is not what they meant. */
  | "not_upcoming"
  /** The dog is at the salon. A text cannot undo that. */
  | "already_arrived";

/**
 * How long after a text an "N" is still taken as an answer to it.
 *
 * Reminders go out 4 days, 2 days and the morning of, so a week covers a
 * reply to any of them. Beyond that the client is almost certainly
 * talking about something else, and matching a three-week-old
 * confirmation would cancel a booking nobody meant to touch.
 */
export const REPLY_MATCH_WINDOW_DAYS = 7;

export function decideReplyAction(input: {
  intent: ReplyIntent;
  /** When the reminder or confirmation this is answering was sent. */
  matchedMessageSentAt: Date | null;
  /** Every appointment in the booking that message was about. */
  bookingAppointments: readonly ReplyCandidate[];
  receivedAt: Date;
}): ReplyActionDecision {
  if (input.intent !== "cancel") return { act: false, reason: "not_a_cancellation" };
  if (!input.matchedMessageSentAt || input.bookingAppointments.length === 0) {
    return { act: false, reason: "no_matching_message" };
  }

  const ageDays =
    (input.receivedAt.getTime() - input.matchedMessageSentAt.getTime()) / 86_400_000;
  if (ageDays > REPLY_MATCH_WINDOW_DAYS) return { act: false, reason: "message_too_old" };

  const live = input.bookingAppointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );
  if (live.length === 0) return { act: false, reason: "already_cancelled" };

  // All of it has to still be ahead of us.
  if (live.some((a) => a.scheduledStart.getTime() <= input.receivedAt.getTime())) {
    return { act: false, reason: "not_upcoming" };
  }

  /*
   * Nothing past `scheduled`. A dog that has been checked in is at the
   * salon, possibly wet, and a text saying N cannot take it off the board
   * — that is a conversation, and the one-tap review in Messages is where
   * it belongs. Mirrors the rule the MoeGo sync works to: only ever act
   * on a row still at `scheduled`.
   */
  if (live.some((a) => a.workflowState !== "scheduled")) {
    return { act: false, reason: "already_arrived" };
  }

  return { act: true, appointmentIds: live.map((a) => a.id) };
}

/**
 * Whether a client's "Y" may mark the booking confirmed on its own.
 *
 * Andy, 06/11/2026, set this up so only an N acted by itself, on the
 * reasoning written at the top of this file: "a confirmation changes
 * nothing operationally — the booking already exists and is already
 * going ahead". That was true while MoeGo held the diary and Groomigo's
 * badge was decoration.
 *
 * Andy, 09/11/2026, the night before the salon runs entirely on
 * Groomigo: "Do a current scan of all the texts that have come back for
 * ones that have been accepted and mark them as so." From tomorrow the
 * badge is how staff know who is actually coming, which is the job
 * MoeGo's Confirmed badge was doing. So a Y now acts.
 *
 * ## It confirms the whole booking, not the row the text was logged against
 *
 * The same reasoning the cancel path already carries, and it matters
 * more here than it looks: one reminder covers a family booking, smsLogs
 * stores only the LEAD appointment's id, and confirming that alone
 * leaves the second dog pending. On the backlog this was 19 dogs of 102.
 *
 * ## Safer than the cancel it mirrors
 *
 * Confirming adds information and removes nobody from the board, so the
 * refusals here exist to keep the badge TRUE rather than to prevent
 * harm: a booking already cancelled, already past, or with the dog
 * already at the salon is not something a "Y" should restate.
 */
export function decideConfirmAction(input: {
  intent: ReplyIntent;
  matchedMessageSentAt: Date | null;
  bookingAppointments: readonly ReplyCandidate[];
  receivedAt: Date;
}): ReplyActionDecision {
  if (input.intent !== "confirm") return { act: false, reason: "not_a_confirmation" };
  if (!input.matchedMessageSentAt || input.bookingAppointments.length === 0) {
    return { act: false, reason: "no_matching_message" };
  }

  const ageDays =
    (input.receivedAt.getTime() - input.matchedMessageSentAt.getTime()) / 86_400_000;
  if (ageDays > REPLY_MATCH_WINDOW_DAYS) return { act: false, reason: "message_too_old" };

  const live = input.bookingAppointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );
  if (live.length === 0) return { act: false, reason: "already_cancelled" };

  // Still ahead of us, and still only booked. Confirming a dog that has
  // already arrived says nothing, and confirming yesterday says less.
  if (live.some((a) => a.scheduledStart.getTime() <= input.receivedAt.getTime())) {
    return { act: false, reason: "not_upcoming" };
  }
  if (live.some((a) => a.workflowState !== "scheduled")) {
    return { act: false, reason: "already_arrived" };
  }

  // Already-confirmed rows are not an error; they simply need no write.
  const toConfirm = live.filter((a) => a.status !== "confirmed");
  if (toConfirm.length === 0) return { act: false, reason: "already_cancelled" };

  return { act: true, appointmentIds: toConfirm.map((a) => a.id) };
}

/** One line for the staff notification and the audit row. */
export function describeReplyRefusal(reason: ReplyActionRefusal): string {
  switch (reason) {
    case "not_a_cancellation": return "Needs a staff tap";
    case "not_a_confirmation": return "Not a confirmation";
    case "no_matching_message": return "Could not tell which booking this is about";
    case "message_too_old": return "Reply came too long after the text it answers";
    case "already_cancelled": return "That booking was already cancelled";
    case "not_upcoming": return "That booking has already started or passed";
    case "already_arrived": return "The dog has already been checked in";
  }
}

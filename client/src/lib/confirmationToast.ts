import { toast } from "sonner";

/**
 * Say whether the client was texted, and when they were not, why.
 *
 * Lauren, 06/11/2026: "Also they dont get a text with their next date."
 * Nobody could answer it. The system already works the answer out —
 * `decideBookingConfirmation` returns a named reason for every branch,
 * and its own comment says that is so "why didn't Mrs Gerard get a
 * text" can be answered — and then every screen threw it away.
 * `createAppointment` has returned `confirmationSms` since it was
 * written, and no caller has ever read it.
 *
 * ## Why this is a toast and not a log line
 *
 * A Render log answers the question for whoever reads Render logs. The
 * person who needs it is standing at the counter having just booked a
 * dog, deciding whether to tell the client the date out loud. "No text
 * sent — SMS automation is off" is a different afternoon from silence.
 *
 * ## It is deliberately quiet about the ordinary cases
 *
 * Some reasons are not news: a MoeGo import, a booking made online that
 * already had its own text, and a booking staff flagged as arranged
 * elsewhere were all never going to send. Toasting those would train
 * everyone to dismiss the ones that matter.
 */
const EXPECTED_SILENCE = [
  "brought across from MoeGo",
  "booked online, already texted",
  "already booked elsewhere",
  "a confirmation has already gone out",
];

export type ConfirmationOutcome = {
  sent: boolean;
  reason?: string | null;
} | null | undefined;

export function toastBookingConfirmation(outcome: ConfirmationOutcome): void {
  if (!outcome) return;
  if (outcome.sent) {
    toast.success("The client has been texted their booking.", { duration: 6000 });
    return;
  }
  const reason = outcome.reason?.trim();
  if (!reason) return;
  if (EXPECTED_SILENCE.some((quiet) => reason.includes(quiet))) return;
  toast.warning(`No text sent — ${reason}.`, { duration: 12000 });
}

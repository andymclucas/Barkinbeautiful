import { describePets } from "./pickupGroup";
import { DEFAULT_SALON } from "./appointmentChangeSms";

/**
 * Texting a client the list of dates they are booked in for.
 *
 * Lauren, 06/11/2026, after setting a year of bookings for Bronwyn
 * Waegh: "I want to send her a list of all her dates in a sms too if
 * possible." A twelve-month series is thirteen dates, nobody reads
 * thirteen dates back over the phone, and the client has nothing to
 * put in a calendar.
 *
 * ## No emoji, deliberately, and this is the one message where it matters
 *
 * Every other template here ends in a paw. One emoji drops the whole
 * message from GSM-7 to UCS-2, which takes the segment size from 153
 * characters to 67. Thirteen dates is about 160 characters of dates
 * alone: with the paw that is four segments, without it two. The paw is
 * worth its cost on a one-segment pickup text and is not worth doubling
 * the bill on the longest message the salon sends.
 *
 * shared/smsSegments.ts is where that arithmetic lives, and
 * upcomingDatesSmsIsGsm7 below exists so a future edit cannot quietly
 * put a dash or a smiley back in and double the cost unnoticed.
 *
 * ## A person presses send
 *
 * This builds a body and nothing more. Nothing here is automated: staff
 * read it and press Send, the same as any other composed text, so it
 * goes out with trigger: "staff" and needs no entry in the allow-list
 * in shared/automatedSms.ts.
 *
 * Not because automated sends are forbidden — six types are allowed
 * there as of 04/11/2026, when Andy turned the confirmation, the
 * reminders, the cancellation and the reschedule back on. This one is
 * not among them because nothing should decide on its own that a
 * client wants a list of dates; somebody asks for it.
 */

/** How many dates one text will name before it says there are more. */
export const MAX_DATES_IN_SMS = 14;

export type UpcomingDatesInput = {
  clientFirstName: string;
  petNames: readonly string[];
  /**
   * Already formatted for reading aloud, in the salon's timezone and in
   * the order they happen — "Fri 12 Feb", "Fri 12 Mar".
   *
   * Formatted by the caller rather than here, because formatting a date
   * means choosing a timezone and this file has no business guessing
   * one. The salon's own formatter is the single place that decides.
   */
  dates: readonly string[];
  salonName?: string;
};

/**
 * The dates a single text will name, and how many it left out.
 *
 * Split out from the body so the composer can say "and 3 more" to the
 * person BEFORE they press send, rather than them discovering it in the
 * client's reply.
 */
export function upcomingDatesShown(dates: readonly string[]): {
  shown: string[];
  omitted: number;
} {
  const clean = dates.map((d) => d.trim()).filter((d) => d !== "");
  return {
    shown: clean.slice(0, MAX_DATES_IN_SMS),
    omitted: Math.max(0, clean.length - MAX_DATES_IN_SMS),
  };
}

/**
 * Whether a body stays inside the GSM-7 alphabet.
 *
 * Not a style preference. An em-dash, a curly apostrophe or an emoji
 * each force UCS-2, which more than doubles the segment count on a
 * message this long. Pinned by a test so the saving cannot be undone by
 * a well-meant typographic tidy-up.
 */
export function upcomingDatesSmsIsGsm7(body: string): boolean {
  // Deliberately a local check on the characters this builder can emit,
  // rather than importing the full table — the point is that the set of
  // characters used here is small and known.
  return !/[^\x20-\x7E\n£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà]/.test(body);
}

export function buildUpcomingDatesSms(input: UpcomingDatesInput): string {
  const salon = input.salonName?.trim() || DEFAULT_SALON;
  const who = input.clientFirstName?.trim() || "there";
  const { subject } = describePets(input.petNames);
  const { shown, omitted } = upcomingDatesShown(input.dates);

  if (shown.length === 0) {
    // Not an error: a client with nothing booked is a normal thing to
    // ask about, and a body saying so is more use than a refusal.
    return `Hi ${who}! ${subject} has no grooming appointments booked with ${salon} at the moment. `
      + `Call us any time to book.`;
  }

  const list = shown.join(", ");
  const more = omitted > 0
    ? ` Plus ${omitted} more after that - call us for the full list.`
    : "";
  const appointment = shown.length === 1 ? "appointment" : "appointments";

  return `Hi ${who}! Here are ${subject}'s grooming ${appointment} at ${salon}: ${list}.${more}`
    + ` Let us know if any need changing.`;
}

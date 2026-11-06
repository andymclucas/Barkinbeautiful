/**
 * Turning one booking into a series.
 *
 * Andy, 06/11/2026, about Bronwyn Waegh: tick "recurring appt" while
 * editing an existing booking, pick 1–14 weeks, and end it "after xxx
 * sessions", on a date, or ongoing.
 *
 * ## It generates AFTER the booking you are standing on
 *
 * The existing createRecurringAppointments builds a series from scratch
 * and creates its first occurrence too. Here the first one already
 * exists — it is the booking being edited — so the dates start one
 * interval later and the original is never touched.
 *
 * That also removes the confusion this morning cost an hour. Lauren set a
 * series from 15 January, the 15th clashed with a groomer and was
 * skipped, the series began on 12 February, and she had no way to tell
 * why. Generating after an appointment that demonstrably exists means
 * there is no first occurrence left to silently lose.
 *
 * ## Dates, not milliseconds
 *
 * Occurrences step by whole DAYS on the calendar and keep the same
 * wall-clock time, rather than adding 7 × 24 × 60 × 60 × 1000 to an
 * instant. In Brisbane the two agree, because there is no daylight
 * saving. They do not agree anywhere that has it: a fortnightly 7:30am
 * booking stepped in milliseconds across a DST boundary becomes 6:30am
 * or 8:30am, and the salon finds out when a dog arrives an hour early.
 * The Pet Pad opens on 23/11/2026 and Groomigo is being sold to salons
 * that will not all be in Queensland.
 *
 * ## Nothing is truly ongoing
 *
 * "Ongoing" means a year, and says so. An unbounded series is either an
 * infinite loop or a number somebody picked and did not write down;
 * twelve months of a six-weekly groom is nine bookings, which is a
 * sensible horizon and easy to extend.
 */

export type RecurrenceEnd =
  | { kind: "count"; sessions: number }
  | { kind: "date"; untilDate: string }
  | { kind: "ongoing" };

/** Andy's range. One week to fourteen. */
export const MIN_FREQUENCY_WEEKS = 1;
export const MAX_FREQUENCY_WEEKS = 14;

/** What "ongoing" actually means, stated rather than implied. */
export const ONGOING_MONTHS = 12;

/**
 * The most a single press may create.
 *
 * A guard against a typo, not a product limit: weekly for a year is 52,
 * and anything past this is somebody having entered the wrong number.
 */
export const MAX_OCCURRENCES = 60;

export type RecurrenceRequest = {
  /** The booking being repeated, as "YYYY-MM-DDTHH:mm" local time. */
  firstStart: string;
  frequencyWeeks: number;
  end: RecurrenceEnd;
};

export type RecurrenceResult =
  | { ok: true; starts: string[]; truncated: boolean }
  | { ok: false; reason: string };

function parseLocal(value: string): { y: number; m: number; d: number; time: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]), time: match[4]! };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Every occurrence AFTER the first, as local "YYYY-MM-DDTHH:mm" strings.
 *
 * Returned as local strings rather than instants so the caller parses
 * them in the salon's own timezone, the same way it parses the booking
 * they came from. A Date here would have to pick a zone, and picking one
 * is how a 7:30am booking becomes 6:30am in another state.
 */
export function recurrenceStarts(request: RecurrenceRequest): RecurrenceResult {
  const first = parseLocal(request.firstStart);
  if (!first) return { ok: false, reason: "That booking has no usable date and time" };

  const weeks = Math.trunc(request.frequencyWeeks);
  if (!Number.isFinite(weeks) || weeks < MIN_FREQUENCY_WEEKS || weeks > MAX_FREQUENCY_WEEKS) {
    return { ok: false, reason: `Repeat every ${MIN_FREQUENCY_WEEKS} to ${MAX_FREQUENCY_WEEKS} weeks` };
  }

  let wanted: number;
  let untilKey: string | null = null;

  if (request.end.kind === "count") {
    const sessions = Math.trunc(request.end.sessions);
    if (!Number.isFinite(sessions) || sessions < 1) {
      return { ok: false, reason: "Choose at least one more session" };
    }
    wanted = sessions;
  } else if (request.end.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.end.untilDate)) {
      return { ok: false, reason: "Choose a date to repeat until" };
    }
    untilKey = request.end.untilDate;
    const firstKey = `${first.y}-${pad(first.m)}-${pad(first.d)}`;
    if (untilKey <= firstKey) {
      return { ok: false, reason: "The end date has to be after this booking" };
    }
    wanted = MAX_OCCURRENCES;
  } else {
    // Ongoing: a year, counted in months so it lands on the same date.
    const horizon = new Date(Date.UTC(first.y, first.m - 1 + ONGOING_MONTHS, first.d));
    untilKey = `${horizon.getUTCFullYear()}-${pad(horizon.getUTCMonth() + 1)}-${pad(horizon.getUTCDate())}`;
    wanted = MAX_OCCURRENCES;
  }

  const starts: string[] = [];
  // UTC arithmetic on a date that carries no time, so a day step cannot be
  // pulled across a boundary by an offset — the same approach addCalendarDays
  // uses. The wall-clock time is carried through untouched.
  const cursor = new Date(Date.UTC(first.y, first.m - 1, first.d));
  for (let i = 0; i < wanted && starts.length < MAX_OCCURRENCES; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + weeks * 7);
    const key = `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`;
    if (untilKey !== null && key > untilKey) break;
    starts.push(`${key}T${first.time}`);
  }

  if (starts.length === 0) {
    return { ok: false, reason: "That gives no further bookings — check the dates" };
  }
  return { ok: true, starts, truncated: starts.length === MAX_OCCURRENCES };
}

/** One line for the confirmation, before anything is written. */
export function describeRecurrence(request: RecurrenceRequest, count: number): string {
  const every = request.frequencyWeeks === 1
    ? "every week"
    : `every ${request.frequencyWeeks} weeks`;
  const booking = count === 1 ? "booking" : "bookings";
  if (request.end.kind === "ongoing") {
    return `${count} more ${booking}, ${every}, for the next ${ONGOING_MONTHS} months.`;
  }
  if (request.end.kind === "count") {
    return `${count} more ${booking}, ${every}.`;
  }
  return `${count} more ${booking}, ${every}, up to ${request.end.untilDate}.`;
}

/**
 * Whether a booking may be repeated, given what its memberships cover now.
 *
 * ## Why this is a rule and not an `if`
 *
 * The first version of the repeat carried each row's price forward and
 * set `membershipId` to null, on the reasoning that coverage would be
 * worked out at invoicing. Nothing works it out at invoicing:
 * `decideAppointmentInvoice` reads the row's own `membershipId`, so an
 * unlinked row with a price is billed for everything.
 *
 * That mattered because "covered" and "priced" are not opposites here.
 * `fullyCovered` is true only when EVERY dog on a booking is covered, so
 * a family where one dog is on a plan and the other is casual carries a
 * membership link AND a price — as do MoeGo rows linked afterwards by
 * the backfill script, which deliberately leaves price alone. Repeating
 * one of those billed the member in full for a groom their weekly fee
 * had already paid for.
 *
 * The repeat therefore RESOLVES coverage like any other booking path
 * rather than copying it. This function is the one case resolving
 * cannot answer on its own: a dog whose row is linked today but whose
 * plan no longer covers it.
 *
 * ## Why a lapse stops the whole thing
 *
 * Two wrong answers are available and both cost money in opposite
 * directions. Carry the link forward and a client whose payments are
 * failing gets a year of free grooms, because `bookingSuspended` is
 * checked by the resolver and by nothing else. Drop the link and keep
 * the price and the member is charged twice.
 *
 * Which it should be is a conversation with the client — paused,
 * cancelled, or a card that needs replacing — not something to guess at
 * sixty times in a loop.
 */
export type BookingRowCoverage = {
  petId: number;
  petName?: string | null;
  /** The membership this row is linked to today, or null. */
  membershipId: number | null;
  /** Whether that dog's plan still covers it, as the resolver sees it now. */
  coveredNow: boolean;
};

export function lapsedCoverage(rows: readonly BookingRowCoverage[]): BookingRowCoverage[] {
  return rows.filter((row) => row.membershipId !== null && !row.coveredNow);
}

export function lapsedCoverageMessage(rows: readonly BookingRowCoverage[]): string | null {
  const gone = lapsedCoverage(rows);
  if (gone.length === 0) return null;
  const names = gone.map((r) => r.petName?.trim()).filter(Boolean) as string[];
  const who = names.length === 0
    ? "A membership on this booking"
    : names.length === 1
      ? `${names[0]}'s membership`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}'s memberships`;
  return `${who} no longer covers that booking — it may be paused, cancelled, or suspended for a `
    + "failed payment. Sort the membership out before repeating the booking.";
}

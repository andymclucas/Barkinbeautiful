/**
 * How far a client may move a booking that is part of a cycle.
 *
 * Andy to Lauren, 11/11/2026: "Bookings can be adjusted in the portal, but
 * it will only show available times — and we can make it so they can't
 * stray too far from the week they 'should' be booked in so it doesn't muck
 * with the 4, 6, 8 week cycle." Lauren: "Excellent!"
 *
 * A booking is "in a cycle" when it belongs to a membership or a repeat
 * series. Where it SHOULD fall is worked out from its neighbours in that
 * cycle — the visit before it plus the interval, and the visit after it
 * minus the interval — not from where it sits now. That matters: anchored
 * on its own date, a client could move it three days, then three more, then
 * three more, and walk the whole cycle out of shape one legal step at a
 * time. Anchored on the neighbours, it always comes back to the grid.
 *
 * The window is that date ± CYCLE_TOLERANCE_DAYS. Three either side is a
 * seven-day spread, which on this salon's Tuesday–Friday week always takes
 * in all four trading days of the week the booking belongs to.
 *
 * Everything is calendar-date arithmetic on "YYYY-MM-DD" keys in UTC, so
 * neither the server's nor the phone's time zone can shift a day.
 */
export const CYCLE_TOLERANCE_DAYS = 3;

const DAY = 86_400_000;
const toMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key: string, days: number) => toKey(toMs(key) + days * DAY);
const isKey = (k: unknown): k is string => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);

export type CycleWindowInput = {
  /** Where the booking is now. */
  currentDateKey: string;
  /** The visit before it in the same cycle, if any. */
  prevDateKey?: string | null;
  /** The visit after it in the same cycle, if any. */
  nextDateKey?: string | null;
  /** The plan's interval; when unknown it is read off the neighbours. */
  intervalWeeks?: number | null;
  toleranceDays?: number;
};

export type CycleWindow = {
  from: string;
  to: string;
  /** The date the cycle puts this booking on. */
  idealDateKey: string;
  intervalWeeks: number | null;
};

/** The interval the neighbours imply, in whole weeks, or null. */
export function inferIntervalWeeks(currentDateKey: string, prev?: string | null, next?: string | null): number | null {
  const gaps: number[] = [];
  if (isKey(prev) && isKey(next)) gaps.push((toMs(next) - toMs(prev)) / DAY / 2);
  else if (isKey(prev)) gaps.push((toMs(currentDateKey) - toMs(prev)) / DAY);
  else if (isKey(next)) gaps.push((toMs(next) - toMs(currentDateKey)) / DAY);
  const days = gaps[0];
  if (days === undefined || days < 7) return null;
  return Math.round(days / 7);
}

export function cycleRescheduleWindow(input: CycleWindowInput): CycleWindow {
  const tol = input.toleranceDays ?? CYCLE_TOLERANCE_DAYS;
  const current = input.currentDateKey;
  const weeks = input.intervalWeeks && input.intervalWeeks > 0
    ? input.intervalWeeks
    : inferIntervalWeeks(current, input.prevDateKey, input.nextDateKey);

  // Where each neighbour says it should be.
  const anchors: string[] = [];
  if (weeks) {
    if (isKey(input.prevDateKey)) anchors.push(addDays(input.prevDateKey, weeks * 7));
    if (isKey(input.nextDateKey)) anchors.push(addDays(input.nextDateKey, -weeks * 7));
  }
  if (anchors.length === 0) anchors.push(current);

  // Inside every neighbour's window at once, when they agree...
  let from = anchors.map((a) => addDays(a, -tol)).sort().at(-1)!;
  let to = anchors.map((a) => addDays(a, tol)).sort()[0]!;
  let ideal = anchors[0];
  // ...and when they cannot — staff moved things so far that the
  // neighbours disagree, or booked this visit outside where the cycle would
  // put it (a late groom, a holiday) — around where it is now. The window
  // never shuts out the date the booking already has: staff put it there,
  // and a window entirely in the past would leave the client nothing to
  // pick at all (review, 11/11/2026).
  if (from > to || current < from || current > to) {
    from = addDays(current, -tol);
    to = addDays(current, tol);
    ideal = current;
  }
  // Never on or past a neighbouring visit: two grooms days apart is not a cycle.
  if (isKey(input.prevDateKey) && from <= input.prevDateKey) from = addDays(input.prevDateKey, 1);
  if (isKey(input.nextDateKey) && to >= input.nextDateKey) to = addDays(input.nextDateKey, -1);
  return { from, to, idealDateKey: ideal, intervalWeeks: weeks ?? null };
}

export const isWithinWindow = (dateKey: string, window: Pick<CycleWindow, "from" | "to">) =>
  dateKey >= window.from && dateKey <= window.to;

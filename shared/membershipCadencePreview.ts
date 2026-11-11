/**
 * The visits a membership sign-up will produce, for the "is this right?"
 * step before it is sent.
 *
 * Andy to Lauren, 11/11/2026: "When they initially book online, it will
 * only give them the options that are relevant to their dog based on
 * weight. And then it will confirm — 'this will give you a booking every 6
 * weeks, do you want to confirm this?'"
 *
 * A preview only: the salon still approves, and the real series is planned
 * on approval (planMembershipSeries), which moves a visit that lands on a
 * day the groomer is away. The COUNT is the one approval books —
 * occurrencesForMonths — so the client is never shown a ninth groom the
 * salon will not create. Calendar-date arithmetic in UTC on "YYYY-MM-DD",
 * so no device time zone can shift a day.
 */
import { occurrencesForMonths } from "./membershipSeries";

export function cadencePreview(firstDateKey: string, intervalWeeks: number, months: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDateKey) || !(intervalWeeks > 0) || !(months > 0)) return [];
  const first = Date.parse(`${firstDateKey}T00:00:00Z`);
  const count = occurrencesForMonths(intervalWeeks, months);
  return Array.from({ length: count }, (_, i) =>
    new Date(first + i * intervalWeeks * 7 * 86_400_000).toISOString().slice(0, 10));
}

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
 * day the groomer is away. Calendar-date arithmetic in UTC on "YYYY-MM-DD",
 * so no device time zone can shift a day.
 */
export function cadencePreview(firstDateKey: string, intervalWeeks: number, months: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDateKey) || !(intervalWeeks > 0) || !(months > 0)) return [];
  const first = Date.parse(`${firstDateKey}T00:00:00Z`);
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + months);
  const dates: string[] = [];
  for (let at = first; at < end.getTime(); at += intervalWeeks * 7 * 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  return dates;
}

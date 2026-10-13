/**
 * A continuous run of calendar days, with the values filled in.
 *
 * A chart needs every day in the range, not just the days something
 * happened: a gap lets the line interpolate straight across a quiet
 * Saturday and invent trade that never occurred. A day with no grooms is a
 * real zero.
 *
 * The days are the SALON'S days. The net sales query buckets on
 * `DATE_FORMAT(CONVERT_TZ(..., '+10:00'))`, so the buckets are Brisbane
 * calendar days — but the axis was built from the UTC date of the range
 * bounds. With a month starting at 30 Sep 14:00 UTC (1 Oct in Brisbane)
 * the axis began on 30 Sep, a day that could never hold a bucket and so was
 * always zero, and stopped one short at the other end. Every point was
 * plotted against the wrong label.
 *
 * Hence string keys throughout. "2026-10-01" is unambiguous; a Date is a
 * moment, and the whole class of bug here comes from treating a moment as
 * a day.
 */
export type DailyPoint = { date: string; net: number };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every day from `startKey` to `endKey` inclusive, in order.
 *
 * Returns nothing for a backwards or unparseable range rather than looping
 * forever or throwing into a dashboard.
 */
export function fillDailySeries(
  startKey: string,
  endKey: string,
  byDay: ReadonlyMap<string, number>,
): DailyPoint[] {
  if (!DAY_KEY.test(startKey) || !DAY_KEY.test(endKey)) return [];
  const cursor = new Date(`${startKey}T00:00:00.000Z`);
  const last = new Date(`${endKey}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];
  if (cursor.getTime() > last.getTime()) return [];

  // Anchored at UTC midnight and stepped by whole days, so the arithmetic
  // never meets a timezone. The KEYS are Brisbane days; this Date is only
  // a counter.
  const out: DailyPoint[] = [];
  while (cursor.getTime() <= last.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, net: byDay.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

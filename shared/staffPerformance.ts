/**
 * Staff performance arithmetic, shared by the table, the phone cards and
 * the CSV export.
 *
 * It lives here because the same two sums were already written out more
 * than once — `revenue / appointments` in the CSV export at one
 * precision and in the table at another — and a third copy was about to
 * go into the phone card. `appointmentMembershipCoverage` is what
 * happens when copies like that drift: the test went on matching two of
 * them while the busiest path changed underneath and lost its guard.
 */

export type StaffPerformanceRow = {
  appointments: number;
  revenue: number;
};

/**
 * Average takings per appointment, or null when nobody came.
 *
 * Null rather than 0: a groomer with no appointments has no average, and
 * dividing anyway gives NaN for 0/0 or Infinity for revenue/0 — both of
 * which the page would print verbatim. The callers render "—".
 */
export function averagePerAppointment(row: StaffPerformanceRow): number | null {
  if (!Number.isFinite(row.revenue) || !Number.isFinite(row.appointments)) return null;
  if (row.appointments <= 0) return null;
  return row.revenue / row.appointments;
}

/**
 * This groomer's share of the period's revenue, as a percentage.
 *
 * Null when there is nothing to divide. An empty period must not say
 * everyone contributed "0.0%" — that reads as a measured result rather
 * than an absence of data.
 */
export function revenueShare(row: StaffPerformanceRow, totalRevenue: number): number | null {
  if (!Number.isFinite(row.revenue) || !Number.isFinite(totalRevenue)) return null;
  if (totalRevenue <= 0) return null;
  return (row.revenue / totalRevenue) * 100;
}

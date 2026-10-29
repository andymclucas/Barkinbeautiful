import { averagePerAppointment, revenueShare } from "@shared/staffPerformance";

/**
 * One groomer's contribution, on a phone.
 *
 * The Staff Performance table is five columns of figures. Even once it
 * stopped pushing the page sideways it still had to scroll inside its
 * own card on a 375px screen, so Revenue — the column the table is named
 * after — sat off the edge until you swiped for it.
 *
 * A card instead. The same five values, stacked, with the takings beside
 * the name where they can be read without moving anything. The bar is
 * the share drawn out; the percentage is written next to it, so nothing
 * here is carried by colour alone.
 */

export type StaffPerformanceCardData = {
  /** The groomer's full name. The table shows only a first name because
      five columns leave no room for more; a card is not that short. */
  name: string;
  appointments: number;
  revenue: number;
  colour: string;
};

const money = (value: number) =>
  `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StaffPerformanceCard({
  staff,
  totalRevenue,
}: {
  staff: StaffPerformanceCardData;
  totalRevenue: number;
}) {
  const average = averagePerAppointment(staff);
  const share = revenueShare(staff, totalRevenue);

  return (
    <div className="flex min-w-0 items-start gap-3 py-3">
      <span
        className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
        style={{ background: staff.colour }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="min-w-0 truncate font-medium">{staff.name}</p>
          <p className="shrink-0 font-medium tabular-nums">{money(staff.revenue)}</p>
        </div>

        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate tabular-nums">
            {staff.appointments} appt{staff.appointments === 1 ? "" : "s"}
            {average !== null ? ` · $${average.toFixed(0)} avg` : ""}
          </span>
          <span className="shrink-0 tabular-nums">
            {share !== null ? `${share.toFixed(1)}%` : "—"}
          </span>
        </div>

        {share !== null && (
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(share, 100)}%`, background: staff.colour }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import type { CSSProperties } from "react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

/**
 * The persistent left rail on the Appointments page.
 *
 * Modelled on how MoeGo and Gingr lay this out, and for the same reason: a
 * groomer standing at the bench needs to see the month, jump to a day, and
 * know what the day is worth without opening anything. Previously the month
 * only existed inside a popover, so picking a date meant open, choose, close,
 * and there was no way to see next week's shape while looking at today.
 */

export interface CalendarSummary {
  totalAppointments: number;
  totalPets: number;
  /** Money actually taken - completed appointments. */
  earnedRevenue: number;
  /** Money booked in, whether or not it has been collected yet. */
  expectedRevenue: number;
  /** Cancelled and no-show bookings, excluded from every figure above. */
  cancelledCount: number;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * 1 through 14. A groomer rebooking at the counter thinks in weeks - "see you
 * in six" - and was previously counting squares on a wall calendar to find the
 * date. Fourteen covers the longest interval the salon books at.
 */
const QUICK_JUMP_WEEKS = Array.from({ length: 14 }, (_, i) => i + 1);

export function CalendarSidebar({
  selected,
  onSelectDate,
  summary,
  summaryLabel,
  className,
}: {
  selected: Date;
  onSelectDate: (date: Date) => void;
  summary: CalendarSummary;
  /** "Wed, 30 Sept" or "Week of 28 Sept" - says what the figures cover. */
  summaryLabel: string;
  className?: string;
}) {
  const jumpWeeks = (weeks: number) => {
    const target = new Date(selected);
    target.setDate(target.getDate() + weeks * 7);
    target.setHours(0, 0, 0, 0);
    onSelectDate(target);
  };

  return (
    <aside
      className={cn(
        // The rail sits in a fixed-height flex column, so without shrink-0 on
        // each card the month grid gets squashed and its last week draws
        // outside the card, on top of the panel below.
        "hidden w-[248px] shrink-0 flex-col gap-3 overflow-y-auto pr-0.5 lg:flex",
        className,
      )}
      aria-label="Calendar navigation and day summary"
    >
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm shadow-slate-200/60">
        <CalendarPicker
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            const next = new Date(d);
            next.setHours(0, 0, 0, 0);
            onSelectDate(next);
          }}
          // 7 columns x 30px. The cells are explicitly sized in
          // ui/calendar.tsx rather than derived from a ratio of their own
          // width, which is what made this render differently in Safari and
          // Chromium; the grid is now the same box in every browser.
          //
          // --cell-size goes in `style` rather than a class because an
          // arbitrary-property utility and the component's own default are
          // the same specificity, so which wins depends on stylesheet order.
          className="mx-auto w-fit p-0"
          style={{ "--cell-size": "30px" } as CSSProperties}
        />
      </div>

      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm shadow-slate-200/60">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Quick jump
        </p>
        <div className="grid grid-cols-5 gap-1">
          {QUICK_JUMP_WEEKS.map((weeks) => (
            <button
              key={weeks}
              type="button"
              onClick={() => jumpWeeks(weeks)}
              title={`${weeks} week${weeks === 1 ? "" : "s"} from the selected day`}
              className="rounded-md border border-transparent bg-slate-100 py-1.5 text-[11px] font-semibold tabular-nums text-slate-700 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              {weeks}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Weeks ahead of the selected day
        </p>
      </div>

      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm shadow-slate-200/60">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {summaryLabel}
        </p>
        <dl className="space-y-1.5">
          <Row label="Total appts" value={String(summary.totalAppointments)} />
          <Row label="Total pets" value={String(summary.totalPets)} />
          <Row label="Earned rev" value={money(summary.earnedRevenue)} tone="text-emerald-700" />
          <Row label="Expected rev" value={money(summary.expectedRevenue)} />
          {summary.cancelledCount > 0 && (
            // The toolbar counts every booking on the day, these figures count
            // only the live ones. Showing the difference stops a correct pair
            // of numbers looking like a bug.
            <Row
              label="Cancelled"
              value={String(summary.cancelledCount)}
              tone="text-muted-foreground"
            />
          )}
        </dl>
      </div>
    </aside>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className={cn("text-[12.5px] font-semibold tabular-nums", tone ?? "text-foreground")}>{value}</dd>
    </div>
  );
}

import type { CSSProperties } from "react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import type { CalendarSummaryFigures } from "@shared/calendarSummary";
/**
 * The persistent left rail on the Appointments page.
 *
 * Modelled on how MoeGo and Gingr lay this out, and for the same reason: a
 * groomer standing at the bench needs to see the month, jump to a day, and
 * know what the day is worth without opening anything. Previously the month
 * only existed inside a popover, so picking a date meant open, choose, close,
 * and there was no way to see next week's shape while looking at today.
 */

/**
 * The shared type, not a copy of it.
 *
 * This used to restate the fields here, and the restatement had already
 * drifted: it described earnedRevenue as "money actually taken", which
 * it never was — it is the price of completed work, and on 27/10/2026
 * it read $1,508 against $350 genuinely collected. A second definition
 * of a type is a second place for the truth to rot.
 */
export type CalendarSummary = CalendarSummaryFigures;

const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * 1 through 14. A groomer rebooking at the counter thinks in weeks - "see you
 * in six" - and was previously counting squares on a wall calendar to find the
 * date. Fourteen covers the longest interval the salon books at.
 */
const QUICK_JUMP_WEEKS = Array.from({ length: 14 }, (_, i) => i + 1);

/**
 * Browsing to another month should land on a sensible day, not reset to
 * the 1st every time: keep the day-of-month where it exists, and clamp to
 * the last day where it does not (31 Jan → 28 Feb).
 */
function startOfMonthDay(month: Date, current: Date): Date {
  const target = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(current.getDate(), lastDay));
  target.setHours(0, 0, 0, 0);
  return target;
}

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
      <div className="shrink-0 rounded-2xl border border-border bg-card/80 p-2 shadow-sm shadow-slate-200/60">
        <CalendarPicker
          mode="single"
          selected={selected}
          // Controlled month. Without this react-day-picker keeps its own,
          // so a quick jump of 4 or 8 weeks moved the calendar underneath
          // while the grid carried on showing the month you started in.
          month={selected}
          onMonthChange={(m) => onSelectDate(startOfMonthDay(m, selected))}
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

      <div className="shrink-0 rounded-2xl border border-border bg-card/80 p-3 shadow-sm shadow-slate-200/60">
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
              className="rounded-md border border-transparent bg-muted py-1.5 text-[11px] font-semibold tabular-nums text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              {weeks}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Weeks ahead of the selected day
        </p>
      </div>

      <div className="shrink-0 rounded-2xl border border-border bg-card/80 p-3 shadow-sm shadow-slate-200/60">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {summaryLabel}
        </p>
        <dl className="space-y-1.5">
          <Row label="Total appts" value={String(summary.totalAppointments)} />
          <Row label="Total pets" value={String(summary.totalPets)} />

          {/* Who is paying for the day, before what it came to.

              A covered groom carries no price, so without this a day of
              25 membership dogs and 10 paying ones reads as a quiet day
              on the money rows alone. The revenue for those 25 arrived
              in weekly debits and is not on this page at all. */}
          {summary.membershipPetCount > 0 && (
            <>
              <Row
                label="On membership"
                value={String(summary.membershipPetCount)}
                tone="text-muted-foreground"
                hint="Covered dogs — their groom carries no price here. The revenue comes through the weekly or monthly membership payment, not today's till."
              />
              <Row
                label="Paying on the day"
                value={String(summary.payingPetCount)}
                tone="text-muted-foreground"
              />
              <Row
                label="Membership value"
                value={money(summary.membershipVisitValue)}
                tone="text-emerald-700 dark:text-emerald-300"
                hint="What the covered grooms are worth as subscription revenue — each plan's weekly rate times the weeks its tier leaves between grooms. Real money, arriving weekly rather than at the counter. Counted once per plan, so a two-dog household's single fee is not doubled."
              />
            </>
          )}
          {summary.unlinkedMembershipPetCount > 0 && (
            /* The figure above is only as complete as the links behind
               it. 128 of 713 upcoming bookings belong to a membership
               client without being linked to the plan — mostly MoeGo
               imports and the extra dogs of multi-dog households. Saying
               so beats quietly understating the covered count. */
            <Row
              label="Not linked to a plan"
              value={String(summary.unlinkedMembershipPetCount)}
              tone="text-amber-700 dark:text-amber-300"
              hint="These dogs belong to a client with an active membership, but the booking is not linked to it — so they are counted as paying and their value is not in the figure above. Usually a MoeGo import, or the second dog of a household on one plan."
            />
          )}

          <Row
            label="Taken"
            value={money(summary.takenRevenue)}
            tone="text-emerald-700 dark:text-emerald-300"
            hint="Money actually recorded against today's dogs, however it was paid."
          />
          {summary.outstandingRevenue > 0 && (
            <Row
              label="Still to collect"
              value={money(summary.outstandingRevenue)}
              tone="text-amber-700 dark:text-amber-300"
              hint="Priced work on the day that has not been paid for yet, counted per dog so an overpayment cannot mask somebody else's debt."
            />
          )}
          <Row
            label="Completed value"
            value={money(summary.earnedRevenue)}
            hint="What the finished grooms are priced at. Not money in — a completed groom nobody has settled still counts here."
          />
          <Row label="Booked in" value={money(summary.expectedRevenue)} hint="Everything priced on the day, finished or not." />
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

function Row({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    // The hint goes on the whole row, not just the label: these figures
    // mean specific things — "Taken" is the till, "Completed value" is
    // not money in — and the difference is the entire point of showing
    // them separately. Someone reading the panel should be able to find
    // that out without opening the code.
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <dt className={cn("text-[11.5px] text-muted-foreground", hint && "cursor-help decoration-dotted underline-offset-2 hover:underline")}>{label}</dt>
      <dd className={cn("text-[12.5px] font-semibold tabular-nums", tone ?? "text-foreground")}>{value}</dd>
    </div>
  );
}

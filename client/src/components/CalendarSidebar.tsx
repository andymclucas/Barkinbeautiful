import type { CSSProperties } from "react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import type { CalendarSummaryFigures } from "@shared/calendarSummary";
import type { CapacityState } from "@shared/dayCapacity";

/** One day's load, keyed "YYYY-MM-DD", as the rail needs it. */
export type CapacityByDate = Record<string, { state: CapacityState; summary: string }>;

/**
 * The dot on each day.
 *
 * Lauren, 30/10/2026: "Moego has a green dot on the whole month calendar
 * on days that aren't at full capacity."
 *
 * Four colours rather than MoeGo's one, because "full" and "somebody is
 * already overbooked" are different problems, and a day with one clip
 * left should not look as open as a day with twenty. A closed day gets
 * no dot at all — an absent dot reads as "nothing here", which is right,
 * where a grey one would read as a state worth checking.
 */
const DOT_CLASS: Record<CapacityState, string> = {
  room:   "relative after:absolute after:bottom-[3px] after:left-1/2 after:h-[5px] after:w-[5px] after:-translate-x-1/2 after:rounded-full after:bg-emerald-500 after:content-['']",
  tight:  "relative after:absolute after:bottom-[3px] after:left-1/2 after:h-[5px] after:w-[5px] after:-translate-x-1/2 after:rounded-full after:bg-amber-500 after:content-['']",
  full:   "relative after:absolute after:bottom-[3px] after:left-1/2 after:h-[5px] after:w-[5px] after:-translate-x-1/2 after:rounded-full after:bg-slate-400 after:content-['']",
  over:   "relative after:absolute after:bottom-[3px] after:left-1/2 after:h-[5px] after:w-[5px] after:-translate-x-1/2 after:rounded-full after:bg-red-500 after:content-['']",
  closed: "",
};

const LEGEND: { state: CapacityState; dot: string; label: string }[] = [
  { state: "room",  dot: "bg-emerald-500", label: "Room" },
  { state: "tight", dot: "bg-amber-500",   label: "Nearly full" },
  { state: "full",  dot: "bg-slate-400",   label: "Full" },
  { state: "over",  dot: "bg-red-500",     label: "Over" },
];

const localDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
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
  capacityByDate,
  className,
}: {
  selected: Date;
  onSelectDate: (date: Date) => void;
  summary: CalendarSummary;
  /** "Wed, 30 Sept" or "Week of 28 Sept" - says what the figures cover. */
  summaryLabel: string;
  /** Per-day load for the dots. Absent while it loads, and the rail
      renders exactly as it did before — no reserved gap, no flicker. */
  capacityByDate?: CapacityByDate;
  className?: string;
}) {
  const capacityModifiers = (() => {
    if (!capacityByDate) return undefined;
    const buckets: Record<string, Date[]> = { room: [], tight: [], full: [], over: [] };
    for (const [key, v] of Object.entries(capacityByDate)) {
      if (v.state === "closed") continue;
      buckets[v.state]?.push(localDay(key));
    }
    return buckets;
  })();

  const selectedKey = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`;
  const selectedCapacity = capacityByDate?.[selectedKey];
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
          modifiers={capacityModifiers}
          modifiersClassNames={{
            room: DOT_CLASS.room, tight: DOT_CLASS.tight,
            full: DOT_CLASS.full, over: DOT_CLASS.over,
          }}
        />

        {capacityByDate && (
          <div
            data-testid="capacity-legend"
            className="mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-1 pb-0.5 text-[10px] text-muted-foreground"
          >
            {LEGEND.map((l) => (
              <span key={l.state} className="flex items-center gap-1">
                <span className={cn("h-1.5 w-1.5 rounded-full", l.dot)} aria-hidden="true" />
                {l.label}
              </span>
            ))}
          </div>
        )}
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
        {/* The dot in words, for the day that is selected.

            The dot alone says "there is room"; this says how much and
            who has it, which is what turns it into a booking decision.
            It carries an overbooked groomer too — that no longer
            changes the dot's colour on an otherwise open day, so this
            is the only place it shows. */}
        {selectedCapacity && (
          <p
            data-testid="capacity-summary"
            className={cn(
              "mb-2 rounded-lg border px-2 py-1.5 text-[11px] leading-snug",
              selectedCapacity.state === "over" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                : selectedCapacity.state === "full" ? "border-border bg-muted text-muted-foreground"
                : selectedCapacity.state === "tight" ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
                : selectedCapacity.state === "closed" ? "border-dashed border-border bg-transparent text-muted-foreground"
                : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200",
            )}
          >
            {selectedCapacity.summary}
          </p>
        )}

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

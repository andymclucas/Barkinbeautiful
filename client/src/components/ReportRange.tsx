import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  brisbaneRangeForDays,
  brisbaneCalendarPeriod,
  brisbaneExplicitRange,
  brisbaneDateKey,
  wholeCalendarYear,
  localCalendarDay,
  localCalendarDayKey,
} from "@shared/localDateTime";

/**
 * The reporting period, shared by Analytics and Reporting.
 *
 * The two pages used to work their dates out separately, and disagreed.
 * Reporting built "YYYY-MM-DD" strings from the browser's clock and sent
 * them bare; the server reads those as UTC midnight, so "last 30 days"
 * actually ended at 10am Brisbane today and quietly dropped the rest of
 * the trading day. Two pages showing two revenue figures for the same
 * month is worse than either being wrong on its own, so the period now
 * has one definition and both pages import it.
 *
 * Rolling windows and calendar periods are different questions and both
 * are offered: month-to-date is what you compare with last month, a
 * rolling 30 days is the steadier trend.
 */
export type RangeKey = "mtd" | "d30" | "wtd" | "d7" | "d90" | "ytd" | "y1" | "custom";

export const REPORT_RANGES: { key: RangeKey; label: string }[] = [
  { key: "mtd", label: "Month to date" },
  { key: "d30", label: "Last 30 days" },
  { key: "wtd", label: "Week to date" },
  { key: "d7", label: "Last 7 days" },
  { key: "d90", label: "Last 90 days" },
  { key: "ytd", label: "Year to date" },
  { key: "y1", label: "Last 12 months" },
  { key: "custom", label: "Custom range…" },
];

const asDay = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "Australia/Brisbane",
  });

/**
 * `?range=mtd` in the URL wins over the page's own default.
 *
 * So a link can say which period it means — the Dashboard's revenue tile
 * sends you to month-to-date explicitly, rather than trusting Analytics
 * to keep defaulting to it. Read once, at mount: changing the dropdown
 * afterwards should not be fought by the address bar.
 */
function rangeFromUrl(): RangeKey | null {
  if (typeof window === "undefined") return null;
  const asked = new URLSearchParams(window.location.search).get("range");
  return REPORT_RANGES.some(r => r.key === asked) ? (asked as RangeKey) : null;
}

export function useReportRange(initial: RangeKey = "mtd") {
  const [rangeKey, setRangeKey] = useState<RangeKey>(() => rangeFromUrl() ?? initial);
  // Defaults to the calendar year, which is the comparison most often
  // wanted against the old system's dashboard.
  const thisYear = brisbaneDateKey().slice(0, 4);
  const [customFrom, setCustomFrom] = useState(`${thisYear}-01-01`);
  const [customTo, setCustomTo] = useState(`${thisYear}-12-31`);
  // The first day of a range being swept out on the calendar, if one is
  // part-picked. See `pickDay`.
  const [anchor, setAnchor] = useState<string | null>(null);

  // Anchored to the salon's own day boundaries, not the viewer's.
  // setHours() uses the browser's timezone, so the previous version
  // produced a different window depending on where it was opened from,
  // and appointments near midnight fell into the wrong period.
  // Queensland is UTC+10 year-round.
  const { from: dateFrom, to: dateTo } = useMemo(() => {
    switch (rangeKey) {
      case "mtd": return brisbaneCalendarPeriod("month");
      case "wtd": return brisbaneCalendarPeriod("week");
      case "ytd": return brisbaneCalendarPeriod("year");
      case "d7": return brisbaneRangeForDays(7);
      case "d90": return brisbaneRangeForDays(90);
      case "y1": return brisbaneRangeForDays(365);
      case "custom": return brisbaneExplicitRange(customFrom, customTo);
      default: return brisbaneRangeForDays(30);
    }
  }, [rangeKey, customFrom, customTo]);

  // The date boxes are always on show and always display the range
  // actually being reported, including under a preset. Editing either one
  // therefore has to keep the other end at what is on screen, not at
  // whatever was last typed into a custom range.
  const fromKey = brisbaneDateKey(dateFrom);
  const toKey = brisbaneDateKey(dateTo);

  const setDays = (nextFrom: string, nextTo: string) => {
    setAnchor(null);
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
    setRangeKey("custom");
  };

  /**
   * One day clicked on the calendar.
   *
   * Click a start, then click an end — the convention everywhere else,
   * and the one the salon will expect. Left to its own devices
   * react-day-picker adjusts whichever end of the existing range is
   * nearest, so with a preset always selected the first click could only
   * ever move the end: clicking 14 September while showing September
   * gave "3 – 14 September" rather than starting afresh.
   *
   * Clicking the two days in either order works; they are sorted here.
   */
  const pickDay = (key: string) => {
    if (anchor === null) {
      setAnchor(key);
      setCustomFrom(key);
      setCustomTo(key);
      setRangeKey("custom");
      return;
    }
    const [lo, hi] = anchor <= key ? [anchor, key] : [key, anchor];
    setDays(lo, hi);
  };

  /** Choosing a preset abandons any half-picked range. */
  const choosePreset = (next: RangeKey) => {
    setAnchor(null);
    setRangeKey(next);
  };

  const editDate = (end: "from" | "to", value: string) => {
    // A half-typed date arrives as "", and clearing the range would blank
    // the whole page.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setDays(end === "from" ? value : fromKey, end === "to" ? value : toKey);
  };

  const pickYear = (year: string) => setDays(`${year}-01-01`, `${year}-12-31`);

  /** "3 Oct – 3 Oct 2026" — name the actual dates, always. */
  const dates = `${asDay(dateFrom, false)} – ${asDay(dateTo, true)}`;

  /** For a heading: the preset's name, or the dates when hand-picked. */
  const label = rangeKey === "custom" ? dates : REPORT_RANGES.find(r => r.key === rangeKey)!.label;

  return { rangeKey, setRangeKey: choosePreset, dateFrom, dateTo, fromKey, toKey, editDate, pickYear, pickDay, setDays, dates, label };
}

export type ReportRange = ReturnType<typeof useReportRange>;

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * The whole period control: the months, the presets and the typed dates,
 * in one block.
 *
 * These started as a toolbar beside the page title with the calendar in a
 * card of its own beneath it, which read as two unrelated things and cost
 * a row of height for the privilege. Everything that changes the period
 * now sits together, with the selects and the typed dates filling the
 * column beside the calendar rather than taking a row above it.
 *
 * Days are handled as local calendar days, never as instants — a grid
 * square is a question about the viewer’s own clock, and handing it the
 * Brisbane instant for 1 January would highlight 31 December for anyone
 * west of here. The reporting window itself stays on the salon’s day.
 */
export function ReportRangePicker({ range }: { range: ReportRange }) {
  const { data: bookingYears } = trpc.analytics.dataYears.useQuery({});
  const [month, setMonth] = useState(() => localCalendarDay(range.fromKey));
  // Two stacked months fill a phone screen before a single figure is
  // visible, so a phone gets one.
  const months = useIsMobile() ? 1 : 2;

  // Follow the range when something else moves it — a preset, a year, a
  // typed date — but leave the view alone while the start is already on
  // screen, so clicking a day in the right-hand month does not shunt it
  // into the left one.
  useEffect(() => {
    const target = localCalendarDay(range.fromKey);
    setMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      const onScreen = sameMonth(target, current) || (months > 1 && sameMonth(target, next));
      return onScreen ? current : target;
    });
  }, [range.fromKey, months]);

  return (
    // The two descendant rules tighten react-day-picker’s own spacing,
    // which is generous for a page that is mostly figures. Everything else
    // is a multiple of --cell-size, so shrinking that shrinks the grid
    // whole rather than leaving a row to overflow in Safari.
    <div className="report-range flex flex-col gap-3 rounded-xl border bg-card p-3 sm:w-fit sm:flex-row sm:items-start [&_.rdp-month]:gap-2 [&_.rdp-week]:mt-1">
      <Calendar
        mode="range"
        numberOfMonths={months}
        month={month}
        onMonthChange={setMonth}
        weekStartsOn={1}
        // Off, or the end of the range is drawn twice: once in its own
        // month and again in the previous month’s trailing row.
        showOutsideDays={false}
        // `selected` is only honoured while `onSelect` is supplied — without
        // it react-day-picker keeps its own copy of the range and ignores
        // ours, which left the band drawn from the previous start. The
        // range it computes is discarded; only the day that was clicked
        // matters, because `pickDay` decides what a click means.
        selected={{ from: localCalendarDay(range.fromKey), to: localCalendarDay(range.toKey) }}
        onSelect={(_ignored, clicked) => range.pickDay(localCalendarDayKey(clicked))}
        className="p-0 [--cell-size:--spacing(7)]"
      />

      <div className="report-range-controls grid w-full gap-2 sm:w-[12rem] sm:shrink-0">
        <Select value={range.rangeKey} onValueChange={v => range.setRangeKey(v as RangeKey)}>
          <SelectTrigger className="h-9 w-full" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_RANGES.map(r => (
              <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* A whole year in one click. The months step one at a time, so
            2024 is two dozen presses of the arrow away. */}
        <Select value={wholeCalendarYear(range.fromKey, range.toKey)} onValueChange={range.pickYear}>
          <SelectTrigger className="h-9 w-full" aria-label="Whole year">
            <SelectValue placeholder="Whole year" />
          </SelectTrigger>
          <SelectContent>
            {(bookingYears?.years ?? []).map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* For when the dates are already known and clicking to them is
            the long way round. */}
        <div className="grid gap-1">
          <Label htmlFor="range-from" className="text-xs text-muted-foreground">From</Label>
          <Input
            id="range-from"
            type="date"
            className="h-9"
            value={range.fromKey}
            onChange={(e) => range.editDate("from", e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="range-to" className="text-xs text-muted-foreground">To</Label>
          <Input
            id="range-to"
            type="date"
            className="h-9"
            value={range.toKey}
            onChange={(e) => range.editDate("to", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

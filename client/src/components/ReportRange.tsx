import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  brisbaneRangeForDays,
  brisbaneCalendarPeriod,
  brisbaneExplicitRange,
  brisbaneDateKey,
  wholeCalendarYear,
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

export function useReportRange(initial: RangeKey = "mtd") {
  const [rangeKey, setRangeKey] = useState<RangeKey>(initial);
  // Defaults to the calendar year, which is the comparison most often
  // wanted against the old system's dashboard.
  const thisYear = brisbaneDateKey().slice(0, 4);
  const [customFrom, setCustomFrom] = useState(`${thisYear}-01-01`);
  const [customTo, setCustomTo] = useState(`${thisYear}-12-31`);

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

  const editDate = (end: "from" | "to", value: string) => {
    // A half-typed date arrives as "", and clearing the range would blank
    // the whole page.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setCustomFrom(end === "from" ? value : fromKey);
    setCustomTo(end === "to" ? value : toKey);
    setRangeKey("custom");
  };

  const pickYear = (year: string) => {
    setCustomFrom(`${year}-01-01`);
    setCustomTo(`${year}-12-31`);
    setRangeKey("custom");
  };

  /** "3 Oct – 3 Oct 2026" — name the actual dates, always. */
  const dates = `${asDay(dateFrom, false)} – ${asDay(dateTo, true)}`;

  /** For a heading: the preset's name, or the dates when hand-picked. */
  const label = rangeKey === "custom" ? dates : REPORT_RANGES.find(r => r.key === rangeKey)!.label;

  return { rangeKey, setRangeKey, dateFrom, dateTo, fromKey, toKey, editDate, pickYear, dates, label };
}

export type ReportRange = ReturnType<typeof useReportRange>;

/**
 * Preset, whole year, and the two dates. Rendered as a fragment so each
 * page can sit it in its own toolbar beside its own export button.
 */
export function ReportRangeControls({ range }: { range: ReportRange }) {
  const { data: bookingYears } = trpc.analytics.dataYears.useQuery({ tenantId: 1 });

  return (
    <>
      <Select value={range.rangeKey} onValueChange={v => range.setRangeKey(v as RangeKey)}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORT_RANGES.map(r => (
            <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* A whole year in one click. The date boxes step a month at a time,
          so 2024 is two dozen clicks on the arrow away. */}
      <Select value={wholeCalendarYear(range.fromKey, range.toKey)} onValueChange={range.pickYear}>
        <SelectTrigger className="h-9 w-[7.5rem]" aria-label="Whole year">
          <SelectValue placeholder="Whole year" />
        </SelectTrigger>
        <SelectContent>
          {(bookingYears?.years ?? []).map(y => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Always visible, never a mode you have to find: the dates on show
          are the dates being reported, whichever preset is on. */}
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          className="h-9 w-[9.5rem]"
          value={range.fromKey}
          aria-label="From date"
          onChange={(e) => range.editDate("from", e.target.value)}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          className="h-9 w-[9.5rem]"
          value={range.toKey}
          aria-label="To date"
          onChange={(e) => range.editDate("to", e.target.value)}
        />
      </div>
    </>
  );
}

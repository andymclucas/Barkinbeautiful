/**
 * Sorting, filtering and paging the Client Retention table.
 *
 * Andy, 05/11/2026: "Add sorting and filters for Client Retention and
 * only show 20 per page."
 *
 * It was a single unbroken table of every dog with history, ordered by
 * total spend and nothing else — so the question it is actually opened
 * to answer ("who is overdue and has nothing booked") meant scrolling
 * past the hundred biggest spenders to find them.
 *
 * Here rather than in the component because every one of these is a
 * judgement about the salon's book — what counts as overdue, whether a
 * dog with no rhythm yet can be overdue at all — and those are worth
 * testing without rendering a table.
 */

export type RetentionRow = {
  petId: number;
  petName: string | null;
  breed: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  visits: number;
  usualGapWeeks: number | null;
  averageSpend: number | null;
  totalSpend: number;
  lastVisit: string | Date | null;
  nextVisit: string | Date | null;
  onMembership?: boolean;
};

export type RetentionSort =
  | "total" | "visits" | "gap" | "spend" | "lastVisit" | "nextVisit" | "name";

export type RetentionFilter = {
  /** Matches the dog, the owner or the phone. */
  search?: string;
  /** Only dogs with nothing in the diary. */
  unbooked?: boolean;
  /** Only dogs past their own usual gap. */
  overdue?: boolean;
  /** Only dogs on a membership, or only dogs not on one. */
  membership?: "any" | "on" | "off";
};

export const RETENTION_PAGE_SIZE = 20;

/**
 * Whether a dog is past its own rhythm.
 *
 * Its OWN median gap, not a salon-wide number: a fortnightly bath and a
 * ten-weekly styled groom are both on time at completely different
 * intervals, and one figure for the salon would call half the book
 * overdue and let the other half drift.
 *
 * A dog with no established gap is never overdue — two visits is not a
 * pattern, and flagging it invents a rhythm the dog does not have. Nor
 * is a dog with something already booked, whenever that booking is:
 * the salon has it in hand and the report is for the ones nobody has.
 */
export function isOverdue(row: RetentionRow, now: Date = new Date()): boolean {
  if (row.nextVisit) return false;
  if (row.usualGapWeeks === null || row.usualGapWeeks <= 0) return false;
  if (!row.lastVisit) return false;
  const last = new Date(row.lastVisit).getTime();
  if (!Number.isFinite(last)) return false;
  const dueBy = last + row.usualGapWeeks * 7 * 86_400_000;
  return now.getTime() > dueBy;
}

function text(row: RetentionRow): string {
  return [row.petName, row.firstName, row.lastName, row.phone, row.breed]
    .filter(Boolean).join(" ").toLowerCase();
}

export function filterRetention(
  rows: readonly RetentionRow[],
  filter: RetentionFilter,
  now: Date = new Date(),
): RetentionRow[] {
  const needle = (filter.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (needle && !text(row).includes(needle)) return false;
    if (filter.unbooked && row.nextVisit) return false;
    if (filter.overdue && !isOverdue(row, now)) return false;
    if (filter.membership === "on" && !row.onMembership) return false;
    if (filter.membership === "off" && row.onMembership) return false;
    return true;
  });
}

/** Null sorts last on every column — "unknown" is not "zero". */
function nullsLast(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

export function sortRetention(
  rows: readonly RetentionRow[],
  sort: RetentionSort,
  descending: boolean,
): RetentionRow[] {
  const d: 1 | -1 = descending ? -1 : 1;
  const time = (value: string | Date | null) => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  };
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sort) {
      case "visits": return nullsLast(a.visits, b.visits, d);
      case "gap": return nullsLast(a.usualGapWeeks, b.usualGapWeeks, d);
      case "spend": return nullsLast(a.averageSpend, b.averageSpend, d);
      case "lastVisit": return nullsLast(time(a.lastVisit), time(b.lastVisit), d);
      case "nextVisit": return nullsLast(time(a.nextVisit), time(b.nextVisit), d);
      case "name": {
        const an = (a.petName ?? "").toLowerCase();
        const bn = (b.petName ?? "").toLowerCase();
        return an === bn ? 0 : (an < bn ? -1 : 1) * d;
      }
      default: return nullsLast(a.totalSpend, b.totalSpend, d);
    }
  });
  return copy;
}

export type RetentionPage = {
  rows: RetentionRow[];
  page: number;
  pageCount: number;
  matched: number;
  from: number;
  to: number;
};

export function pageRetention(
  rows: readonly RetentionRow[],
  page: number,
  pageSize: number = RETENTION_PAGE_SIZE,
): RetentionPage {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  /* Clamped, because a filter that shrinks the list while somebody is
     on page 7 must not leave them staring at an empty table. */
  const safe = Math.min(Math.max(1, page), pageCount);
  const start = (safe - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    rows: slice,
    page: safe,
    pageCount,
    matched: rows.length,
    from: rows.length === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

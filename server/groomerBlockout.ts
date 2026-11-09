/**
 * Is a groomer actually away at this time?
 *
 * Asked by the recurring booking path, which until 10/11/2026 asked a
 * much blunter question — "does this groomer have anything at all then?"
 * — and so refused nearly every date it was given. See
 * `shared/recurringOccurrence.ts` for what that cost.
 *
 * Leave is stored per DAY with an optional time window on it, so the
 * overlap has to be worked out in Brisbane wall-clock minutes rather
 * than by comparing instants: `blockout_date` is a date, and a row with
 * `is_full_day` covers midnight to midnight of that salon day.
 */
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { staff, staffBlockouts } from "../drizzle/schema";
import { brisbaneDateKey } from "../shared/localDateTime";
import { timeValueToMinutes } from "../shared/bookingTimeSlots";
import type { OccurrenceBlockout } from "../shared/recurringOccurrence";

const DAY_END_MINUTES = 24 * 60;

/** Minutes from Brisbane midnight, for an instant. */
function brisbaneMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * The leave that genuinely covers [start, end) for any of these staff.
 *
 * Empty means nobody is away — which is the normal answer, and the one
 * that lets the booking through.
 */
export async function findBlockoutsCovering(
  db: any,
  input: {
    tenantId: number;
    staffIds: readonly number[];
    start: Date;
    end: Date;
  }
): Promise<OccurrenceBlockout[]> {
  if (input.staffIds.length === 0) return [];

  const dayKey = brisbaneDateKey(input.start);
  /* The window in salon minutes. An occurrence that runs past midnight
     is clamped rather than wrapped: the salon closes long before, and a
     wrapped window would match leave on the following morning. */
  const wantFrom = brisbaneMinutes(input.start);
  const wantTo = Math.max(
    wantFrom + 1,
    Math.min(DAY_END_MINUTES, brisbaneMinutes(input.end) || DAY_END_MINUTES)
  );

  const rows = await db
    .select({
      staffId: staffBlockouts.staffId,
      staffName: staff.name,
      isFullDay: staffBlockouts.isFullDay,
      startTime: staffBlockouts.startTime,
      endTime: staffBlockouts.endTime,
      reason: staffBlockouts.reason,
      day: sql<string>`DATE_FORMAT(${staffBlockouts.blockoutDate}, '%Y-%m-%d')`,
    })
    .from(staffBlockouts)
    .leftJoin(staff, eq(staff.id, staffBlockouts.staffId))
    .where(
      and(
        eq(staffBlockouts.tenantId, input.tenantId),
        inArray(staffBlockouts.staffId, [...input.staffIds]),
        /* A day either side, because `blockout_date` is stored as a
           timestamp and the salon day it names is not the UTC one. The
           exact day is matched on the formatted key below. */
        gte(
          staffBlockouts.blockoutDate,
          new Date(input.start.getTime() - 36 * 60 * 60 * 1000)
        ),
        lt(
          staffBlockouts.blockoutDate,
          new Date(input.start.getTime() + 36 * 60 * 60 * 1000)
        )
      )
    );

  return (rows as any[])
    .filter(row => String(row.day) === dayKey)
    .filter(row => {
      if (row.isFullDay) return true;
      const from = timeValueToMinutes(row.startTime ?? "") ?? 0;
      const to = timeValueToMinutes(row.endTime ?? "") ?? DAY_END_MINUTES;
      return from < wantTo && to > wantFrom;
    })
    .map(row => ({
      staffId: Number(row.staffId),
      staffName: row.staffName ?? null,
      reason: row.reason ?? null,
    }));
}

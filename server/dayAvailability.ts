import { and, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { appointments, pets, staff, staffBlockouts } from "../drizzle/schema";
import { tradingWeekdays, type DayAvailability } from "../shared/nextAvailableSlot";
import type { BusyInterval } from "../shared/groomerAvailability";
import { parseBrisbaneLocalDateTime } from "../shared/localDateTime";
import { timeValueToMinutes } from "../shared/bookingTimeSlots";
import type { getDb } from "./db";

/**
 * One groomer-day at a time: who is free, who is full, and when the
 * salon is shut.
 *
 * Lifted out of calendar.nextAvailable on 05/11/2026 unchanged, because
 * the rebook dialog needs exactly the same picture and a second copy is
 * what drifts. The subtleties here are all paid for:
 *
 *  - trading days are LEARNED from the diary, not configured, because
 *    nothing records opening days and a closed day is not a blockout —
 *    without it the search offered a Saturday the salon is shut;
 *  - with no groomer chosen the SALON is the unit, so one person being
 *    busy does not block a slot another could take;
 *  - the trading query groups by the select ALIAS, because Drizzle
 *    qualifies a column differently in the two clauses and TiDB's
 *    ONLY_FULL_GROUP_BY rejects the mismatch. That exact bug returned a
 *    500 from this procedure until 30/10/2026, and the hermetic suite
 *    cannot see it.
 *
 * `capacity` is deliberately MAX_SAFE_INTEGER or 0 rather than a real
 * count: the per-person capacity check has already been made here, and
 * what the caller needs to know is only whether the day has room.
 */
export type DayAvailabilityResult = {
  days: DayAvailability[];
  /** Salon-local minutes past midnight, for "not in the past" checks. */
  minutesInSalonDay: (at: Date) => number;
  /** Set when there is nothing to search; days is then empty. */
  error?: string;
};

/** Whatever getDb hands back, minus the null it returns with no URL. */
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function buildDayAvailability(
  db: Db,
  tenantId: number,
  options: { staffIds: number[]; fromDate: string; days: number },
): Promise<DayAvailabilityResult> {
  const from = parseBrisbaneLocalDateTime(`${options.fromDate}T00:00:00`);
  const to = new Date(from.getTime() + options.days * 86_400_000);
  const minutesInSalonDay = (at: Date): number => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(at);
    return Number(parts.find((p) => p.type === "hour")?.value ?? "0") * 60
      + Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  };

  const wantStaff = Array.from(new Set(options.staffIds));
  const roster = await db.select({
    id: staff.id, name: staff.name,
    dailyClipCapacity: staff.dailyClipCapacity, isActive: staff.isActive,
  }).from(staff).where(eq(staff.tenantId, tenantId));
  /* No groomer chosen yet: anyone who clips will do, so the search
     asks whether the SALON has room rather than one person. */
  const searchStaff = wantStaff.length > 0
    ? roster.filter((r) => wantStaff.includes(r.id))
    : roster.filter((r) => r.isActive && typeof r.dailyClipCapacity === "number" && r.dailyClipCapacity > 0);
  if (searchStaff.length === 0) return { days: [], minutesInSalonDay, error: "No groomer to look at." };
  const searchIds = searchStaff.map((r) => r.id);

  /* Which weekdays this salon trades on, learned from its own
     diary. Closed days are not blockouts — they simply have no
     bookings — so without this the search offered Saturday
     31/10/2026, a day the salon is shut. */
  const WEEKS_OBSERVED = 8;
  /* Grouped by the select ALIAS — see the note on closeSalon's guard.
     Drizzle qualifies a column differently in the select list than in
     the group by, and ONLY_FULL_GROUP_BY rejects the mismatch, so
     this whole procedure returned a 500 until 30/10/2026. */
  const tradingRows = await db.select({
    weekday: sql<number>`DAYOFWEEK(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00')) - 1`.as("weekday"),
    daysTraded: sql<number>`COUNT(DISTINCT DATE(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00')))`.as("days_traded"),
  }).from(appointments).where(and(
    eq(appointments.tenantId, tenantId),
    notInArray(appointments.status, ["cancelled", "no_show"]),
    gte(appointments.scheduledStart, new Date(Date.now() - WEEKS_OBSERVED * 7 * 86_400_000)),
    lt(appointments.scheduledStart, new Date()),
  )).groupBy(sql`weekday`);
  const trading = tradingWeekdays(
    Object.fromEntries(tradingRows.map((r) => [Number(r.weekday), Number(r.daysTraded)])),
    WEEKS_OBSERVED,
  );

  const [booked, leave] = await Promise.all([
    db.select({
      staffId: appointments.staffId,
      day: sql<string>`DATE_FORMAT(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00'), '%Y-%m-%d')`,
      scheduledStart: appointments.scheduledStart,
      scheduledEnd: appointments.scheduledEnd,
      petName: pets.name,
    }).from(appointments).leftJoin(pets, eq(appointments.petId, pets.id)).where(and(
      eq(appointments.tenantId, tenantId),
      inArray(appointments.staffId, searchIds),
      gte(appointments.scheduledStart, from),
      lt(appointments.scheduledStart, to),
      ne(appointments.status, "cancelled"),
      ne(appointments.workflowState, "cancelled"),
    )),
    db.select({
      staffId: staffBlockouts.staffId,
      day: sql<string>`DATE_FORMAT(${staffBlockouts.blockoutDate}, '%Y-%m-%d')`,
      isFullDay: staffBlockouts.isFullDay,
      startTime: staffBlockouts.startTime,
      endTime: staffBlockouts.endTime,
      reason: staffBlockouts.reason,
    }).from(staffBlockouts).where(and(
      eq(staffBlockouts.tenantId, tenantId),
      inArray(staffBlockouts.staffId, searchIds),
      gte(staffBlockouts.blockoutDate, from),
      lt(staffBlockouts.blockoutDate, to),
    )),
  ]);

  const busyByDay = new Map<string, BusyInterval[]>();
  const bookedByDayStaff = new Map<string, number>();
  for (const row of booked) {
    if (row.staffId == null || !row.scheduledStart || !row.scheduledEnd) continue;
    const key = String(row.day);
    bookedByDayStaff.set(`${key}:${row.staffId}`, (bookedByDayStaff.get(`${key}:${row.staffId}`) ?? 0) + 1);
    /* Only a chosen groomer's own bookings block a slot. With nobody
       chosen the salon is the unit, and one person being busy does
       not stop another taking the dog. */
    if (wantStaff.length === 0) continue;
    const startMinutes = minutesInSalonDay(new Date(row.scheduledStart));
    const endMinutes = Math.max(startMinutes + 1, minutesInSalonDay(new Date(row.scheduledEnd)));
    if (!busyByDay.has(key)) busyByDay.set(key, []);
    busyByDay.get(key)!.push({ startMinutes, endMinutes, kind: "appointment", label: row.petName ?? "A dog" });
  }
  const awayByDayStaff = new Set<string>();
  for (const row of leave) {
    const key = String(row.day);
    if (row.isFullDay) awayByDayStaff.add(`${key}:${row.staffId}`);
    if (wantStaff.length === 0) continue;
    const startMinutes = row.isFullDay ? 0 : timeValueToMinutes(row.startTime ?? "") ?? 0;
    const endMinutes = row.isFullDay ? 24 * 60 : timeValueToMinutes(row.endTime ?? "") ?? 24 * 60;
    if (!busyByDay.has(key)) busyByDay.set(key, []);
    busyByDay.get(key)!.push({ startMinutes, endMinutes, kind: "blockout", label: row.reason ?? "Leave" });
  }

  const days: DayAvailability[] = [];
  for (let i = 0; i < options.days; i++) {
    const at = new Date(from.getTime() + i * 86_400_000);
    const dateKey = new Date(at.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
    /* Every chosen groomer must have room; with nobody chosen, any
       one of them having room is enough. */
    const loads = searchStaff
      .filter((r) => !awayByDayStaff.has(`${dateKey}:${r.id}`))
      .map((r) => ({
        capacity: typeof r.dailyClipCapacity === "number" ? r.dailyClipCapacity : null,
        booked: bookedByDayStaff.get(`${dateKey}:${r.id}`) ?? 0,
      }));
    const withRoom = loads.filter((l) => l.capacity === null || l.booked < l.capacity);
    const hasRoom = wantStaff.length === 0 ? withRoom.length > 0 : withRoom.length === loads.length && loads.length > 0;
    const [y, mo, d] = dateKey.split("-").map(Number);
    const weekday = new Date(Date.UTC(y!, mo! - 1, d!)).getUTCDay();
    days.push({
      dateKey,
      busy: busyByDay.get(dateKey) ?? [],
      booked: loads.reduce((n, l) => n + l.booked, 0),
      capacity: hasRoom ? Number.MAX_SAFE_INTEGER : 0,
      closed: loads.length === 0 || !trading.has(weekday),
    });
  }



  return { days, minutesInSalonDay };
}

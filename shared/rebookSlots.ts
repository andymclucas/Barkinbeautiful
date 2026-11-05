import {
  dayIsBookable,
  freeSlotsOn,
  type DayAvailability,
  type NextSlotOptions,
} from "./nextAvailableSlot";

/**
 * What to offer when staff jump the rebook dialog weeks ahead.
 *
 * Lauren, 05/11/2026, having just taught Megs to invoice and rebook:
 * "We love that we can see if they have the next date but when then
 * when we jump weeks ahead.. it would be handy to only show timeslots
 * that are free for those dates. Is it possible? Like 10 weeks from
 * now.. time slots - 9am, 12pm, 12:30 or no time slots on that day.
 * Shows other alternative dates around that 10 week mark."
 *
 * Three answers, and the third is the one that makes it usable at the
 * counter with a client waiting:
 *
 *  - the times that are genuinely free on the day they jumped to;
 *  - when there are none, WHY — shut, full, or open with nothing that
 *    fits, because "the salon is closed that day" and "Charlotte is
 *    fully booked" lead a receptionist to completely different next
 *    sentences;
 *  - the nearest days either side that do have room, so the answer to
 *    "nothing on the 14th" is "the 13th or the 16th" rather than
 *    another search.
 *
 * All of it reads the same DayAvailability the next-available search
 * already builds, and the per-day rule is freeSlotsOn, so what the
 * dialog OFFERS and what the finder SUGGESTS cannot drift apart.
 */

export type DaySlots = {
  dateKey: string;
  /** Free start times in salon minutes, earliest first. */
  slots: number[];
};

/** Why the day they asked for has nothing. Null when it has something. */
export type NoSlotReason = "closed" | "atCapacity" | "noGaps" | "unknown";

export type SlotsAroundTarget = {
  target: DaySlots & { reason: NoSlotReason | null };
  /** Nearest days with room, closest to the target first. */
  alternatives: DaySlots[];
};

export type AroundTargetOptions = NextSlotOptions & {
  /** How many alternative days to offer. */
  maxAlternatives?: number;
  /** How far either side of the target still counts as "around" it. */
  maxDistanceDays?: number;
};

export const DEFAULT_MAX_ALTERNATIVES = 4;
export const DEFAULT_MAX_DISTANCE_DAYS = 14;

export function slotsAroundTarget(
  days: readonly DayAvailability[],
  targetDateKey: string,
  opts: AroundTargetOptions,
): SlotsAroundTarget {
  const maxAlternatives = opts.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES;
  const maxDistance = opts.maxDistanceDays ?? DEFAULT_MAX_DISTANCE_DAYS;

  const index = days.findIndex((d) => d.dateKey === targetDateKey);
  if (index === -1) {
    // The caller did not include the day it asked about. Say so rather
    // than reporting it closed, which would be a different and wrong
    // thing to tell a receptionist.
    return {
      target: { dateKey: targetDateKey, slots: [], reason: "unknown" },
      alternatives: [],
    };
  }

  const targetDay = days[index]!;
  const targetSlots = freeSlotsOn(targetDay, opts);
  const bookable = dayIsBookable(targetDay);
  const reason: NoSlotReason | null = targetSlots.length > 0
    ? null
    : bookable.reason ?? "noGaps";

  /*
   * Walk outward a day at a time, taking whichever side is nearer and
   * the earlier date when they are equally near. The tie-break is for
   * determinism, not a judgement about which is better — a day either
   * side of the target is equally good to a dog.
   */
  const alternatives: DaySlots[] = [];
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    for (const at of [index - distance, index + distance]) {
      if (at < 0 || at >= days.length) continue;
      const day = days[at]!;
      const slots = freeSlotsOn(day, opts);
      if (slots.length === 0) continue;
      alternatives.push({ dateKey: day.dateKey, slots });
      if (alternatives.length >= maxAlternatives) {
        return { target: { dateKey: targetDay.dateKey, slots: targetSlots, reason }, alternatives };
      }
    }
  }

  return { target: { dateKey: targetDay.dateKey, slots: targetSlots, reason }, alternatives };
}

/** What to tell staff when the day they picked has nothing on it. */
export function describeNoSlotReason(reason: NoSlotReason): string {
  switch (reason) {
    case "closed":
      return "The salon is closed that day.";
    case "atCapacity":
      return "That day is fully booked.";
    case "noGaps":
      return "No gap long enough that day.";
    default:
      return "That day is outside the dates looked at.";
  }
}

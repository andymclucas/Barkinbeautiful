/**
 * How much of the diary the public may take.
 *
 * There are TWO limits here and they count different things. Collapsing
 * them into one is what made online booking unusable: on 21/10/2026, 22
 * of the next 40 groomer-days already read as "full" against an online
 * cap of 6, because the cap was counting every appointment in the day —
 * including the dozens booked by staff over the phone. Every groomer
 * here runs 7-10 dogs against a cap of 6, so the public picker was
 * empty on most dates and nobody could have booked at all.
 *
 * Andy, 21/10/2026, choosing between the two readings: "Cap online
 * bookings only."
 *
 * So:
 *
 *  - **The online cap** (`staff.online_max_dogs_per_day`) rations
 *    STRANGERS. It counts only rows with `booked_online = 1`. Six means
 *    "the public may take six of today's slots", not "this groomer does
 *    six dogs".
 *
 *  - **Real capacity** (`staff.daily_clip_capacity`) is the groomer's
 *    actual day, and it counts EVERYTHING — phone bookings included,
 *    with a tidy worth half a clip. Lauren's numbers: Charlie 8, Megs
 *    8, Zakaria 6, Brooklyn 6, Ash 5. An online stranger must not be
 *    able to push Charlie to a ninth clip just because the public had
 *    only taken two of its six.
 *
 * Both have to pass. The first stops the public eating the diary; the
 * second stops them overfilling a day that staff have already filled.
 */

import { clipLoadOf, groomerDayLoad } from "./groomerCapacity";

export type OnlineCapacityVerdict =
  | { available: true }
  | { available: false; reason: string };

/**
 * `online_max_dogs_per_day`, counting only what the public booked.
 *
 * 0 is the existing "no cap" value — it is what an empty box saves as,
 * and it must not read as "no online bookings at all".
 */
export function withinOnlineDailyCap(params: {
  onlineBookingsToday: number;
  dailyLimit: number | null | undefined;
}): boolean {
  const limit = params.dailyLimit;
  if (typeof limit !== "number" || limit <= 0) return true;
  return params.onlineBookingsToday < limit;
}

/**
 * The groomer's real day, in clips, across every appointment.
 *
 * Returns true when there is no recorded capacity: an unset figure is
 * not a reason to refuse a booking, the same way `groomerDayLoad`
 * treats it as "unknown" rather than zero.
 */
export function withinRealClipCapacity(params: {
  /** Every service booked that day for this groomer, online or not. */
  serviceTypesToday: readonly (string | null | undefined)[];
  /** The service the public is trying to add. */
  addingServiceType: string | null | undefined;
  dailyClipCapacity: number | null | undefined;
}): boolean {
  const load = groomerDayLoad(clipLoadOf(params.serviceTypesToday), params.dailyClipCapacity);
  if (load.capacity === null) return true;
  return load.booked + clipLoadOf([params.addingServiceType]) <= load.capacity;
}

/**
 * Both limits, with the reason the client is shown.
 *
 * The two reasons are deliberately the same sentence. A stranger does
 * not need to know which internal number they hit, and "that groomer
 * has reached their daily online booking limit" invites the reply "but
 * your website showed Tuesday as free" — it is the day that is full,
 * whichever way.
 */
export function onlineDailyCapacityVerdict(params: {
  onlineBookingsToday: number;
  dailyLimit: number | null | undefined;
  serviceTypesToday: readonly (string | null | undefined)[];
  addingServiceType: string | null | undefined;
  dailyClipCapacity: number | null | undefined;
}): OnlineCapacityVerdict {
  const FULL = "That groomer is fully booked that day";
  if (!withinOnlineDailyCap(params)) return { available: false, reason: FULL };
  if (!withinRealClipCapacity(params)) return { available: false, reason: FULL };
  return { available: true };
}

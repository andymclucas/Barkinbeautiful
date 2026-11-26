/**
 * "Next available" on the public online booking page.
 *
 * Andy, 26/11/2026: "With the online booking system, build in a 'next
 * available' button so people don't have to guess what day if they don't
 * know when the next appointment is going to be."
 *
 * The portal got the same button two days earlier
 * (shared/portalNextAvailable.ts), and the day-by-day search is shared
 * with it on the server. What differs here is who is searched: a stranger
 * on the public page may not have picked a groomer yet, so the search
 * covers every groomer who takes online bookings for that service and the
 * answer picks one for them.
 */

export type OnlineGroomer = {
  id: number;
  /** `staff.onlineServices`: a JSON array of service types, or null. */
  services: string | null;
};

/**
 * Does this groomer take the service online?
 *
 * The same reading the capacity check gives `staff.onlineServices`: null,
 * an empty list, or JSON that will not parse all mean "no restriction".
 * Kept identical on purpose, so the search never spends its checks on a
 * groomer the capacity check would refuse every time.
 */
export function groomerOffersOnlineService(services: string | null | undefined, serviceType: string): boolean {
  if (!services) return true;
  try {
    const allowed: unknown = JSON.parse(services);
    if (!Array.isArray(allowed) || allowed.length === 0) return true;
    return allowed.includes(serviceType);
  } catch {
    return true;
  }
}

/**
 * The groomers to search, in the order given.
 *
 * With a groomer chosen, only that groomer, and only if they are on the
 * online list and take the service; a stale or made-up id searches nobody
 * rather than everybody. With none chosen, everyone who takes the service.
 */
export function groomersToSearch(
  groomers: readonly OnlineGroomer[],
  serviceType: string,
  chosenStaffId: number | null | undefined,
): number[] {
  return groomers
    .filter((groomer) => (chosenStaffId ? groomer.id === chosenStaffId : true))
    .filter((groomer) => groomerOffersOnlineService(groomer.services, serviceType))
    .map((groomer) => groomer.id);
}

/**
 * "No preferred groomer" (Andy, 26/11/2026: "if people are new, or don't
 * mind, they can just try and take the next available appointment").
 *
 * The time list for that choice shows each time once, however many
 * groomers are free then. This groups the clear (time, groomer) pairs by
 * time, earliest first, keeping the groomers in the order given, so the
 * caller can give each time to the first groomer who passes the full
 * capacity check.
 */
export function groomersByStart(
  candidates: readonly { scheduledStart: Date; staffId: number }[],
): Array<{ scheduledStart: Date; staffIds: number[] }> {
  const byTime = new Map<number, { scheduledStart: Date; staffIds: number[] }>();
  for (const candidate of candidates) {
    const key = candidate.scheduledStart.getTime();
    const entry = byTime.get(key) ?? { scheduledStart: candidate.scheduledStart, staffIds: [] };
    if (!entry.staffIds.includes(candidate.staffId)) entry.staffIds.push(candidate.staffId);
    byTime.set(key, entry);
  }
  return [...byTime.values()].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

/**
 * Who else is looking at this record right now.
 *
 * Andy, 22/10/2026: "I want to go in and create some add-ons for Jessie
 * (Andrea Rooney) today, but not sure if someone else is doing this at
 * the same time... just some sort of live identifier that something is
 * happening."
 *
 * **This is presence, not locking.** It tells you Lauren is in there; it
 * does not stop either of you saving. That is deliberate: a lock someone
 * forgets to release is worse than the problem it solves, and a salon
 * floor cannot wait for an admin to clear one. Two people who can see
 * each other will sort it out in three seconds.
 *
 * Everything here is pure so the expiry arithmetic can be tested without
 * timers. The registry that holds the entries lives in
 * server/presenceRegistry.ts, and the transport is the SSE channel that
 * already exists for the notification bell.
 */

/** How often a viewer says "still here". */
export const PRESENCE_HEARTBEAT_MS = 20_000;

/**
 * How long an entry survives without a heartbeat.
 *
 * Two and a half beats. One missed beat is a slow request or a laptop
 * that slept for a moment, and dropping someone for that would make the
 * indicator flicker — which teaches people to ignore it. Three beats
 * would leave a ghost on screen for a minute after someone closed the
 * tab, which is worse: it stops the next person working.
 */
export const PRESENCE_TTL_MS = 50_000;

export type PresenceEntry = {
  userId: number;
  name: string;
  /** Epoch ms of the last heartbeat. */
  lastSeen: number;
};

export type PresenceViewer = { userId: number; name: string; initials: string };

/**
 * The key a record is tracked under: "appointment:4821".
 *
 * A string rather than a pair, because it is a Map key, an event field
 * and a React dependency, and three shapes for one idea is three places
 * to get it wrong. Returns null for a missing id so a dialog that has
 * not loaded yet simply does not register.
 */
export function presenceKey(kind: string, id: number | null | undefined): string | null {
  const clean = String(kind ?? "").trim();
  if (!clean) return null;
  if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) return null;
  return `${clean}:${id}`;
}

export function isPresenceFresh(entry: PresenceEntry, now: number): boolean {
  return now - entry.lastSeen < PRESENCE_TTL_MS;
}

/** "Lauren Romari" -> "LR", "Megs" -> "M". Two letters at most. */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
  return letters.join("");
}

/**
 * The people to show, newest-silent dropped and yourself removed.
 *
 * Sorted by name so the avatars do not reshuffle on every heartbeat —
 * a row of faces that reorders itself reads as activity that is not
 * happening.
 */
export function activeViewers(
  entries: readonly PresenceEntry[],
  options: { now: number; excludeUserId?: number | null },
): PresenceViewer[] {
  const seen = new Map<number, PresenceEntry>();
  for (const entry of entries) {
    if (!isPresenceFresh(entry, options.now)) continue;
    if (options.excludeUserId != null && entry.userId === options.excludeUserId) continue;
    // One entry per person, however many tabs they have open.
    const existing = seen.get(entry.userId);
    if (!existing || entry.lastSeen > existing.lastSeen) seen.set(entry.userId, entry);
  }
  return Array.from(seen.values())
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId - b.userId)
    .map((e) => ({ userId: e.userId, name: e.name, initials: initialsOf(e.name) }));
}

/**
 * The sentence under the avatars.
 *
 * Says "also has this open", not "is editing" — the system knows someone
 * has the dialog on screen, and nothing more. Claiming they are editing
 * would be a guess, and a wrong one every time somebody leaves a tab up.
 */
export function describeViewers(viewers: readonly PresenceViewer[]): string {
  const names = viewers.map((v) => v.name.trim()).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} also has this open`;
  if (names.length === 2) return `${names[0]} and ${names[1]} also have this open`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 === 1 ? "" : "s"} also have this open`;
}

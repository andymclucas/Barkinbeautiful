/**
 * The last few things somebody found by searching, so getting back to them
 * is one tap instead of typing the name again.
 *
 * Andy, 12/11/2026: "Add a recent search when clicking in the clients or
 * global search boxes. Possibly the last 5 searches that something was
 * clicked on."
 *
 * A search only counts once a result was OPENED. A query typed and
 * abandoned found nothing anyone wanted, and offering it back is noise.
 * What is remembered is the result itself (where it goes and what it is
 * called), with the words that found it kept beside it as a reminder.
 */

export const RECENT_SEARCH_LIMIT = 5;

export type RecentSearchKind = "client" | "pet" | "appointment";

export type RecentSearch = {
  kind: RecentSearchKind;
  /** The name a person reads: "Aaron Harch", "Luna". */
  title: string;
  /** Context under it: the dogs, the owner, the date. */
  subtitle: string | null;
  /** Where it opens. Always a path inside the app. */
  href: string;
  /** What was typed to find it. */
  query: string;
  /** When it was opened, ms since epoch. */
  at: number;
};

const KINDS: readonly RecentSearchKind[] = ["client", "pet", "appointment"];

/**
 * Only a path inside this app, so a value somebody edited in their browser
 * storage cannot turn a recent search into a link to another site or a
 * `javascript:` URL.
 */
export function isInAppHref(href: unknown): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");
}

/** Put the newest first, drop any older visit to the same place, keep five. */
export function rememberSearch(
  list: readonly RecentSearch[],
  entry: RecentSearch,
  limit = RECENT_SEARCH_LIMIT,
): RecentSearch[] {
  const title = entry.title.trim();
  if (!title || !isInAppHref(entry.href)) return [...list].slice(0, limit);
  const clean: RecentSearch = { ...entry, title, query: entry.query.trim() };
  return [clean, ...list.filter((item) => item.href !== clean.href)].slice(0, limit);
}

/**
 * Read back what storage held. Anything malformed is dropped rather than
 * thrown: a recent list we cannot read is an empty list, not a broken
 * search box.
 */
export function parseRecentSearches(raw: string | null | undefined, limit = RECENT_SEARCH_LIMIT): RecentSearch[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: RecentSearch[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!KINDS.includes(r.kind as RecentSearchKind)) continue;
    if (typeof r.title !== "string" || !r.title.trim()) continue;
    if (!isInAppHref(r.href) || seen.has(r.href)) continue;
    seen.add(r.href);
    out.push({
      kind: r.kind as RecentSearchKind,
      title: r.title.trim(),
      subtitle: typeof r.subtitle === "string" && r.subtitle.trim() ? r.subtitle.trim() : null,
      href: r.href,
      query: typeof r.query === "string" ? r.query.trim() : "",
      at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Which list this is. Kept apart per person and per salon: the salon iPad
 * is shared, and an owner with two salons should not be offered a client
 * from the other one, whose link would not open here.
 */
export function recentSearchStorageKey(box: "global" | "clients", userId: number | null | undefined, salonId: number | null | undefined): string {
  return `gsos.recentSearches.${box}.${userId ?? "anon"}.${salonId ?? "home"}`;
}

/**
 * The client a link on the clients list opens — `/clients/42`, or
 * `/clients/42?pet=7` from a dog — or null for any other link (a phone
 * number, an email, a booking).
 */
export function clientIdFromHref(href: string | null | undefined): number | null {
  const match = /^\/clients\/(\d+)(?:[?#/]|$)/.exec(href ?? "");
  return match ? Number(match[1]) : null;
}

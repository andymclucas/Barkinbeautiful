/**
 * One search box for the whole app.
 *
 * Andy, 03/11/2026: "an overall 'search' button at the top which shows
 * regardless of the navigation tab. Search by any detail at all - also
 * can show appts and workflow items."
 *
 * Three searches already existed — clients on the memberships page,
 * pets on the client record, appointments on the calendar — each
 * reachable only from the page that owns it. This is the ranking and
 * labelling they have in common, kept pure so it can be tested without
 * a database and shared so the three do not drift into four.
 */

export type SearchKind = "client" | "pet" | "appointment";

export type SearchHit = {
  kind: SearchKind;
  id: number;
  /** The line a person reads first. */
  title: string;
  /** Context under it: the owner, the breed, the date. */
  subtitle: string | null;
  /** What matched, when it was not the title — "0412 345 678", "Cavoodle". */
  matchedOn: string | null;
  /** Where clicking it goes. */
  href: string;
  /** Only for appointments: where it is in the 12-state machine. */
  workflowState?: string | null;
  /**
   * Only for clients: their dogs, so a result can be taken straight to
   * the right animal.
   *
   * Andy, 03/11/2026: "show the dog or all dogs in the family that can
   * be clickable when searching with the main search function."
   *
   * Searching an owner's name and getting only the owner means a second
   * search, or a scroll down their record, to reach the dog you were
   * actually after — and the dog is what the salon talks in.
   *
   * Departed dogs are left out. `pets.status` is active|departed|archived and
   * departed is how this salon retires a duplicate, so listing them
   * would offer dead links to records nobody wants reopened.
   */
  dogs?: { id: number; name: string }[];
};

/** Phone numbers are typed with spaces, dashes and brackets; none of it matters. */
export function normalisePhone(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * Is this query a phone number rather than a name?
 *
 * "0412" is four digits and a perfectly good start to a phone search,
 * so the test is "digits and punctuation only", not a length.
 */
export function looksLikePhone(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= 3 && /^[\d\s()+-]+$/.test(trimmed);
}

/**
 * Lower is better.
 *
 * An exact match beats a prefix beats a contains, because typing
 * "Bella" and getting six dogs whose owners live on Bellavista Road
 * before the dog called Bella is the way a search box earns the
 * reputation of being useless.
 */
export function matchRank(haystack: string | null | undefined, needle: string): number {
  const h = (haystack ?? "").trim().toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!h || !n) return 99;
  if (h === n) return 0;
  if (h.startsWith(n)) return 1;
  // A match at a word boundary reads as deliberate; mid-word is a coincidence.
  if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(h)) return 2;
  if (h.includes(n)) return 3;
  return 99;
}

/**
 * Kind order for equally good text matches.
 *
 * A dog's name is the thing staff search for most — the salon talks in
 * dog names — so a pet outranks its owner on a tie. Appointments come
 * last because there are thousands of them and they are nearly always
 * reached THROUGH a dog or a client.
 */
const KIND_WEIGHT: Record<SearchKind, number> = { pet: 0, client: 1, appointment: 2 };

export function rankHits(hits: readonly SearchHit[], query: string): SearchHit[] {
  return [...hits].sort((a, b) => {
    const ra = Math.min(matchRank(a.title, query), matchRank(a.matchedOn, query));
    const rb = Math.min(matchRank(b.title, query), matchRank(b.matchedOn, query));
    if (ra !== rb) return ra - rb;
    if (KIND_WEIGHT[a.kind] !== KIND_WEIGHT[b.kind]) return KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind];
    return a.title.localeCompare(b.title);
  });
}

/**
 * Keep room for every kind of result.
 *
 * Ranking alone is not enough. "Bella" is twelve dogs in this salon, so
 * an exact-match-first order filled all twelve slots with dogs and the
 * client and appointment groups never appeared at all — which is half
 * of what the search box was asked for.
 *
 * So each kind gets a reserved share, taken in rank order within the
 * kind. A kind that cannot fill its share gives the remainder back,
 * so searching something that is only a client still returns ten
 * clients rather than four.
 */
export function capPerKind(
  hits: readonly SearchHit[],
  caps: Record<SearchKind, number>,
  total: number,
): SearchHit[] {
  const taken: Record<SearchKind, number> = { pet: 0, client: 0, appointment: 0 };
  const kept: SearchHit[] = [];
  const overflow: SearchHit[] = [];
  for (const hit of hits) {
    if (taken[hit.kind] < caps[hit.kind]) {
      taken[hit.kind] += 1;
      kept.push(hit);
    } else {
      overflow.push(hit);
    }
  }
  // Unused share goes back, in the original rank order.
  return [...kept, ...overflow].slice(0, total);
}

/** The heading a group of results sits under. */
export function groupLabel(kind: SearchKind, count: number): string {
  if (kind === "pet") return count === 1 ? "Dog" : "Dogs";
  if (kind === "client") return count === 1 ? "Client" : "Clients";
  return count === 1 ? "Appointment" : "Appointments";
}

/**
 * Where an appointment result should take you.
 *
 * A dog that is IN the salon belongs on the workflow board — that is
 * the screen staff act on while it is there. Anything else belongs on
 * the calendar, where it can be moved and edited. Sending a dog
 * mid-groom to the calendar is the small daily friction this search is
 * supposed to remove.
 */
const ON_THE_FLOOR = new Set([
  "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry",
  "drying", "waiting_for_groom", "grooming", "ready",
]);

export function appointmentHref(state: string | null | undefined, localDay: string): string {
  return ON_THE_FLOOR.has((state ?? "").trim()) ? "/workflow" : `/calendar?date=${localDay}`;
}

export function isOnTheFloor(state: string | null | undefined): boolean {
  return ON_THE_FLOOR.has((state ?? "").trim());
}

/**
 * The one line of context under a result's title.
 *
 * `subtitle` and `matchedOn` are filled independently by the server and
 * routinely say the same thing. A client found by phone gets the phone
 * as both — `subtitle: c.phone` and `matchedOn: c.phone` — and a dog
 * found by breed gets the breed in both. Rendered in two places, the
 * row printed it twice.
 *
 * One meta line instead, with anything the subtitle already contains
 * dropped, so a phone search reads "0412 345 678" rather than
 * "0412 345 678        0412 345 678".
 */
export function hitMeta(hit: Pick<SearchHit, "subtitle" | "matchedOn">): string | null {
  const subtitle = hit.subtitle?.trim() ?? "";
  const matched = hit.matchedOn?.trim() ?? "";
  const extra = matched && !subtitle.toLowerCase().includes(matched.toLowerCase()) ? matched : "";
  return [subtitle, extra].filter(Boolean).join(" · ") || null;
}

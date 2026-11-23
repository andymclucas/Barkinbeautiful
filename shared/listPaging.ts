/**
 * Page numbers for a long list, and remembering where a list was left.
 *
 * Lauren, 24/11/2026, on the Memberships list: "can we put a 1-4page choice
 * up the top of this screen...Its doing my head in manually scrolling to the
 * bottom, to go to the next page - then find the person, call them for their
 * email or card details... then it does back to main clients page... back to
 * membership section.... scroll to bottom & repeat."
 *
 * Two fixes: numbered pages she can jump to from the top of the list, and
 * the list coming back on the page she left it on.
 */

export type PageButton = number | "gap";

/**
 * Every page when there are seven or fewer. Beyond that the first, the
 * last and the pages either side of the current one, with a gap marker
 * where pages are skipped, so the row never grows past nine buttons.
 */
export function pageButtons(page: number, totalPages: number): PageButton[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(page)), total);
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => shown.add(n));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => shown.add(n));
  const pages = Array.from(shown).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: PageButton[] = [];
  for (const n of pages) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

export type SavedListView = {
  page: number;
  tab: string;
  tier: string;
  search: string;
  sortKey: string;
  sortDir: "asc" | "desc";
};

/**
 * Reads back a saved view, trusting nothing in it: storage can hold
 * anything, from an older version of this shape to plain garbage. Fields
 * that do not check out fall back to the defaults one at a time.
 */
export function readSavedListView(
  raw: string | null | undefined,
  defaults: SavedListView,
  allowed: { tabs: readonly string[]; tiers: readonly string[]; sortKeys: readonly string[] },
): SavedListView {
  if (!raw) return defaults;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return defaults; }
  if (!parsed || typeof parsed !== "object") return defaults;
  const v = parsed as Record<string, unknown>;
  const page = typeof v.page === "number" && Number.isInteger(v.page) && v.page >= 1 && v.page <= 1000 ? v.page : defaults.page;
  const tab = typeof v.tab === "string" && allowed.tabs.includes(v.tab) ? v.tab : defaults.tab;
  const tier = typeof v.tier === "string" && allowed.tiers.includes(v.tier) ? v.tier : defaults.tier;
  const search = typeof v.search === "string" ? v.search.slice(0, 100) : defaults.search;
  const sortKey = typeof v.sortKey === "string" && allowed.sortKeys.includes(v.sortKey) ? v.sortKey : defaults.sortKey;
  const sortDir = v.sortDir === "asc" || v.sortDir === "desc" ? v.sortDir : defaults.sortDir;
  return { page, tab, tier, search, sortKey, sortDir };
}

/** A check on one saved field: true when the stored value can be used. */
export type FieldCheck = (value: unknown) => boolean;

export const isPageNumber: FieldCheck = (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10000;
export const isShortText: FieldCheck = (v) => typeof v === "string" && v.length <= 100;
export const isBoolean: FieldCheck = (v) => typeof v === "boolean";
export const oneOf = (allowed: readonly unknown[]): FieldCheck => (v) => allowed.includes(v);

/**
 * The general form of readSavedListView, for lists whose filters are not
 * the Memberships set: each field has its own check, and any field that
 * fails it, or is missing, keeps its default.
 */
export function readSavedView<T extends Record<string, unknown>>(
  raw: string | null | undefined,
  defaults: T,
  checks: { [K in keyof T]: FieldCheck },
): T {
  if (!raw) return defaults;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return defaults; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
  const stored = parsed as Record<string, unknown>;
  const out = { ...defaults };
  for (const key of Object.keys(checks) as Array<keyof T>) {
    const value = stored[key as string];
    if (checks[key](value)) out[key] = value as T[keyof T];
  }
  return out;
}

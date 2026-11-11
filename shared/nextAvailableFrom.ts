/**
 * Where "Next available" starts looking.
 *
 * Lauren, 11/11/2026: "I noticed next available date just shows me
 * November dates. Even though I'm on the January month." Someone paging the
 * diary to January is answering a January question — a client who can only
 * come after the school holidays — so the search starts from the day on
 * screen. Never from a day already past: today is the floor, because a slot
 * in the past is not available whatever the diary is showing.
 */
export function nextAvailableFrom(viewingDateKey: string | null | undefined, todayKey: string): string {
  const valid = typeof viewingDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(viewingDateKey);
  return valid && viewingDateKey > todayKey ? viewingDateKey : todayKey;
}

/**
 * Which salon this browser tab is looking at.
 *
 * Lauren owns two from 23/11/2026 — Barkin' Beautiful and The Pet Pad —
 * and the switcher in the header moves between them.
 *
 * ## Per tab, deliberately
 *
 * sessionStorage, not localStorage: an owner comparing two salons opens a
 * tab for each, and a shared value would make both tabs jump whenever she
 * switched either one. sessionStorage is scoped to the tab, so each stays
 * where it was put, and closing the tab forgets it.
 *
 * ## It is a request, not a decision
 *
 * The value is sent as a header and the SERVER decides. It is checked
 * against the salons that user actually has access to and discarded if it
 * is not among them — see shared/salonAccess.ts. Nothing here can select a
 * salon somebody is not in, which is why it is safe for it to live
 * somewhere the user can edit.
 */
const KEY = "gsos.activeSalon";

export const SALON_HEADER = "x-groomigo-salon";

export function readActiveSalon(): number | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    // Private windows and blocked site data both throw. A salon we cannot
    // remember is survivable; the server falls back to their own.
    return null;
  }
}

export function writeActiveSalon(tenantId: number | null): void {
  try {
    if (tenantId === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(tenantId));
  } catch {
    // Ignored for the same reason.
  }
}

import { readSavedView, type FieldCheck } from "@shared/listPaging";

/**
 * Where a list was left, kept for this browser tab only (sessionStorage),
 * so going to a client and back lands on the same page with the same
 * filters. Storage can be blocked or empty in a private window, so both
 * sides fail quietly and the list simply starts fresh.
 */
export function loadSavedView<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
  checks: { [K in keyof T]: FieldCheck },
): T {
  if (typeof window === "undefined") return defaults;
  let raw: string | null = null;
  try { raw = window.sessionStorage.getItem(key); } catch { /* blocked */ }
  return readSavedView(raw, defaults, checks);
}

export function saveView(key: string, view: Record<string, unknown>): void {
  try { window.sessionStorage.setItem(key, JSON.stringify(view)); } catch { /* blocked */ }
}

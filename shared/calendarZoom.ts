/**
 * How tall an hour is on the day grid, and how pinching changes it.
 *
 * Andy, 05/11/2026: "a zoom in and out function on mobile which (like
 * Google or Apple calendar works)".
 *
 * The hour height was a module constant read by fifteen call sites in
 * Calendar.tsx. The maths that decides it lives here instead, pure, so
 * the clamping and the scroll anchoring can be tested without a DOM —
 * the gesture itself cannot be, and that is exactly the part worth
 * keeping thin.
 *
 * Zooming the TIME axis is what both Google and Apple do, and it is
 * what helps here: a taller hour is a taller card, and a taller card is
 * how three stacked dogs become readable. The staff columns keep their
 * width, so the board never scrolls sideways because someone zoomed in.
 */

/** px per hour at zoom 1 — the height the board has always drawn at. */
export const BASE_HOUR_HEIGHT = 72;

/**
 * Out far enough to see a whole day at 43px an hour, in far enough for
 * a 30-minute booking to be a comfortable tap target at 108px.
 */
export const MIN_CALENDAR_ZOOM = 0.6;
export const MAX_CALENDAR_ZOOM = 3;

/** What one press of the zoom buttons is worth. */
export const CALENDAR_ZOOM_STEP = 0.25;

export function clampCalendarZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_CALENDAR_ZOOM, Math.max(MIN_CALENDAR_ZOOM, zoom));
}

/**
 * Rounded to a whole pixel. A fractional hour height compounds over
 * eleven rows into a grid line that sits a pixel off the label beside
 * it, which looks like a bug and is one.
 */
export function hourHeightFor(zoom: number): number {
  return Math.round(BASE_HOUR_HEIGHT * clampCalendarZoom(zoom));
}

/** Where a pinch has got to, as a multiple of where it started. */
export function zoomFromPinch(
  startZoom: number,
  startDistancePx: number,
  distancePx: number,
): number {
  if (!(startDistancePx > 0) || !(distancePx > 0)) return clampCalendarZoom(startZoom);
  return clampCalendarZoom(startZoom * (distancePx / startDistancePx));
}

/** One step in or out from the buttons. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  return clampCalendarZoom(clampCalendarZoom(zoom) + direction * CALENDAR_ZOOM_STEP);
}

/**
 * Keep the moment under the fingers still while the grid grows around
 * it. Without this the board rushes past under a pinch, because the
 * content above the viewport grows too and pushes everything down.
 */
export function anchoredScrollTop(input: {
  scrollTop: number;
  /** Where the pinch centre sits inside the scroll viewport. */
  anchorOffsetY: number;
  fromHourHeight: number;
  toHourHeight: number;
}): number {
  const { scrollTop, anchorOffsetY, fromHourHeight, toHourHeight } = input;
  if (!(fromHourHeight > 0)) return Math.max(0, scrollTop);
  const ratio = toHourHeight / fromHourHeight;
  return Math.max(0, (scrollTop + anchorOffsetY) * ratio - anchorOffsetY);
}

/** A zoom read back from localStorage, where anything may be waiting. */
export function parseStoredZoom(raw: string | null): number {
  if (!raw) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampCalendarZoom(parsed) : 1;
}

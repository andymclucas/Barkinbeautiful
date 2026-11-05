import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  anchoredScrollTop,
  hourHeightFor,
  MAX_CALENDAR_ZOOM,
  MIN_CALENDAR_ZOOM,
  parseStoredZoom,
  steppedZoom,
  zoomFromPinch,
} from "@shared/calendarZoom";

/** Per device, not per tenant — how close you hold a phone is yours. */
const STORAGE_KEY = "groomigo_calendar_zoom_v1";

/**
 * Pinch-to-zoom the day grid's time axis, the way Google and Apple
 * Calendar do it, plus buttons for anyone on a mouse.
 *
 * All the arithmetic lives in shared/calendarZoom.ts and is unit
 * tested. What is left here is the part that cannot be: the two-finger
 * gesture, and keeping the scroll position honest while the grid grows
 * underneath it.
 *
 * The scroll correction runs in a LAYOUT effect rather than inside the
 * touchmove handler. Setting scrollTop mid-gesture asks the browser to
 * scroll content that is still the old height, so it clamps the value
 * and the board lurches; after the layout effect the taller grid is
 * already in the DOM and the same number lands where it was meant to.
 */
export function useCalendarZoom(scrollRef: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState(() => {
    try {
      return parseStoredZoom(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 1;
    }
  });

  const hourHeight = hourHeightFor(zoom);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Where the fingers were, so the moment under them stays still. Null
  // for the buttons, which anchor on the middle of what you can see.
  const anchorRef = useRef<number | null>(null);
  const previousHeightRef = useRef(hourHeight);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const from = previousHeightRef.current;
    previousHeightRef.current = hourHeight;
    if (!el || from === hourHeight) return;
    el.scrollTop = anchoredScrollTop({
      scrollTop: el.scrollTop,
      anchorOffsetY: anchorRef.current ?? el.clientHeight / 2,
      fromHourHeight: from,
      toHourHeight: hourHeight,
    });
  }, [hourHeight, scrollRef]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(zoom));
    } catch {
      // A private window with storage blocked still gets to zoom; it
      // just forgets between loads.
    }
  }, [zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startDistance = 0;
    let startZoom = 1;
    let pinching = false;
    /*
     * touchmove fires far faster than the screen refreshes, and every
     * setZoom re-renders the whole day board. Coalescing to one frame
     * keeps the gesture at the phone's refresh rate instead of asking
     * React to lay out thirty cards per event.
     */
    let frame = 0;
    let pending = 0;

    const spread = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinching = true;
      startDistance = spread(event.touches);
      startZoom = zoomRef.current;
      anchorRef.current =
        (event.touches[0].clientY + event.touches[1].clientY) / 2 -
        el.getBoundingClientRect().top;
    };

    const onMove = (event: TouchEvent) => {
      if (!pinching || event.touches.length !== 2) return;
      // Non-passive on purpose: without this the browser zooms the
      // whole page instead, which is the thing that makes a web
      // calendar feel unlike a native one.
      event.preventDefault();
      pending = zoomFromPinch(startZoom, startDistance, spread(event.touches));
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setZoom(pending);
      });
    };

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      pinching = false;
      /*
       * The anchor is deliberately NOT cleared here. setZoom is
       * batched, so the layout effect that uses it runs after this
       * handler has returned — clearing it now would re-anchor the
       * last frame of the pinch on the middle of the screen and jump
       * the board as the fingers lift. The buttons clear it for
       * themselves, and the next touchstart overwrites it.
       */
      // Land on where the fingers actually finished, not on whichever
      // frame happened to run last.
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        setZoom(pending);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef]);

  const zoomBy = useCallback((direction: 1 | -1) => {
    anchorRef.current = null;
    setZoom((current) => steppedZoom(current, direction));
  }, []);

  const resetZoom = useCallback(() => {
    anchorRef.current = null;
    setZoom(1);
  }, []);

  return {
    zoom,
    hourHeight,
    zoomIn: () => zoomBy(1),
    zoomOut: () => zoomBy(-1),
    resetZoom,
    canZoomIn: zoom < MAX_CALENDAR_ZOOM,
    canZoomOut: zoom > MIN_CALENDAR_ZOOM,
  };
}

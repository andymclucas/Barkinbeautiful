/**
 * Meta (Facebook) Pixel, loaded on demand by the pages that want it.
 *
 * Deliberately not in index.html: that would put Meta's script on every
 * staff screen and every client's portal. Only the public booking page
 * calls this, and only for a salon that has a pixel (shared/metaPixel.ts).
 *
 * This is Meta's standard snippet, unrolled. No personal details are ever
 * passed to it — the booking form's name, phone and email stay out.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

const initialised = new Set<string>();

/** Load the pixel once, initialise `pixelId` once, and record a PageView. */
export function loadMetaPixel(pixelId: string): void {
  if (typeof window === "undefined") return;
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = META_PIXEL_SCRIPT_SRC;
    document.head.appendChild(script);
  }
  if (!initialised.has(pixelId)) {
    initialised.add(pixelId);
    window.fbq("init", pixelId);
  }
  window.fbq("track", "PageView");
}

/** Record a standard event, if a pixel has been loaded on this page. */
export function trackMetaPixel(event: "Schedule" | "Lead" | "PageView"): void {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", event);
}

/** Test seam: forget everything loaded so far. */
export function resetMetaPixelForTests(): void {
  initialised.clear();
  delete window.fbq;
  delete window._fbq;
  document.querySelectorAll(`script[src="${META_PIXEL_SCRIPT_SRC}"]`).forEach(s => s.remove());
}

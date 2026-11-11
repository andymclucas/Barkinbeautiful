/**
 * A picture of what the person is looking at, for "Report a problem".
 *
 * html-to-image draws the live DOM through an SVG foreignObject, so the
 * browser renders the CSS itself — Tailwind 4's oklch colours included,
 * which canvas-repainting libraries get wrong. Taken BEFORE the report
 * dialog opens, so the dialog is not in the picture.
 *
 * It is best effort and must never stop a report: any failure returns
 * null and the person can still attach a photo. Known limit: an inner
 * panel scrolled part-way down is drawn from its top.
 */
import { toJpeg } from "html-to-image";

/** Elements carrying this attribute are left out of the picture. */
export const SCREENSHOT_IGNORE_ATTR = "data-screenshot-ignore";

export async function captureScreen(): Promise<Blob | null> {
  try {
    const node = document.body;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dataUrl = await toJpeg(node, {
      quality: 0.8,
      // Retina detail is wasted on a bug report and quadruples the size.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      // Draw the part of the page that is on screen, not the top of it.
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      // Web fonts come from Google's servers and cannot be read back for
      // embedding; the system fallback is perfectly legible.
      skipFonts: true,
      cacheBust: false,
      filter: (el) => !(el instanceof HTMLElement && el.hasAttribute(SCREENSHOT_IGNORE_ATTR)),
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch (err) {
    console.warn("[captureScreen] no screenshot:", err);
    return null;
  }
}

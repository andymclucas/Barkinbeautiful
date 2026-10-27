import { useEffect } from "react";
import { extractBuildId, isNewBuild } from "@shared/buildVersion";

/**
 * Reload an unattended screen when a new build is deployed.
 *
 * For the TV on the salon wall, which is opened once and then left for
 * weeks. It never changes route, so it never fetches another chunk,
 * so the lazy-chunk reload cannot help it — that one only fires when
 * an import fails. Without this the display runs whatever bundle it
 * loaded on the day somebody opened it.
 *
 * Only for screens nobody is interacting with. On a page where staff
 * are typing, a reload mid-sentence is worse than stale code; the
 * board and the calendar deliberately do NOT use this.
 */
export function useBuildVersionReload(options: { intervalMs?: number } = {}): void {
  const intervalMs = options.intervalMs ?? 10 * 60 * 1000;

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    // What this page is actually running, read from the document that
    // loaded it rather than a constant baked in at build time — a
    // constant is one more thing to forget when the build changes.
    const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
    const current = script ? extractBuildId(script.src) : null;
    // Null in development, and on anything that is not the built app.
    // Polling would be pointless and reloading actively harmful.
    if (!current) return;

    let cancelled = false;

    const check = async () => {
      try {
        // no-store, or the browser happily answers from the very cache
        // this is trying to notice has gone stale.
        const response = await fetch("/", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const latest = extractBuildId(await response.text());
        if (!cancelled && isNewBuild(current, latest)) window.location.reload();
      } catch {
        // Salon wifi drops. Try again at the next tick rather than
        // treating a failed fetch as news.
      }
    };

    const timer = window.setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}

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
 * Two modes, because two kinds of screen.
 *
 * "reload" is for a wall display nobody touches: it reloads itself.
 * "notify" is for a page staff type into — it reports that a new build
 * exists and lets them choose when, because a reload mid-sentence
 * loses what somebody was entering and is worse than stale code.
 *
 * The staff board turns out to need the second. It is cast to a screen
 * in the salon AND typed into, and with no check at all it was running
 * whichever bundle it loaded days ago.
 */
export function useBuildVersionReload(
  options: { intervalMs?: number; mode?: "reload" | "notify"; onNewBuild?: () => void } = {},
): void {
  const intervalMs = options.intervalMs ?? 10 * 60 * 1000;
  const mode = options.mode ?? "reload";
  const onNewBuild = options.onNewBuild;

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
        if (cancelled || !isNewBuild(current, latest)) return;
        if (mode === "notify") onNewBuild?.();
        else window.location.reload();
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
  }, [intervalMs, mode, onNewBuild]);
}

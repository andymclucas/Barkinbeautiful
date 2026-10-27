import { lazy, type ComponentType } from "react";

/**
 * `lazy()`, but a chunk that vanished in a deploy reloads the page.
 *
 * Pages are code-split, so the app fetches a chunk the first time a
 * route is opened. Render replaces the whole `assets/` folder on every
 * deploy and the filenames are content-hashed, so a tab that was open
 * BEFORE a deploy asks for a chunk that no longer exists. The server
 * answers with index.html — it is a single-page app, every unknown path
 * returns the shell — the browser cannot parse HTML as a module, and
 * the error boundary shows "An unexpected error occurred" over a stack
 * trace naming a file nobody can look up.
 *
 * Andy hit exactly this on 27/10/2026: his tab was running
 * index-CRpeu-Lf.js while the server had moved to index-CKu8sC71.js.
 * Nothing was wrong with the page he was opening. It will happen to
 * whoever has the app open during any deploy, which in this salon is
 * everyone, all day.
 *
 * A reload fixes it because index.html is never cached with a hash —
 * the fresh copy names the new chunks.
 */

/** Only reload once in a while, so a genuinely broken chunk cannot loop. */
const RELOAD_MARKER = "groomigo:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

function recentlyReloaded(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARKER) ?? 0);
    return Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS;
  } catch {
    // Private mode, blocked storage. Without a marker a reload could
    // loop, so treat it as "already reloaded" and show the error
    // instead — a visible error beats a page that reloads for ever.
    return true;
  }
}

function markReloaded(): void {
  try {
    window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    // Nothing to do. recentlyReloaded() has already refused the reload.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      if (typeof window === "undefined" || recentlyReloaded()) throw error;
      markReloaded();
      window.location.reload();
      // Never settles: the document is being replaced, and resolving
      // would render a page that is about to be thrown away.
      return new Promise<{ default: T }>(() => {});
    }
  });
}

import { useCallback, useEffect, useState } from "react";

/**
 * Whether the sidebar's groups open when you hover over them.
 *
 * Andy, 05/11/2026: "Make them clickable - not just expand on hover.
 * Make this a feature to be able to turn on or off in profile settings
 * so each user can have it customised the way they want."
 *
 * Clicking works either way — that is not what this switches. This is
 * only whether hovering ALSO opens a group, which is the part people
 * disagree about: it is quick if you know the menu and it is menus
 * flapping open at you if you do not.
 *
 * ## Why localStorage and not a column on `users`
 *
 * It is the same shape as every other per-person display preference in
 * this app — the dark/light theme, the Christmas theme, the chart style
 * on the dashboard, and the sidebar's own width all live here. A column
 * would need a migration ahead of the code (CLAUDE.md §6) and a
 * round-trip on every page load to decide whether a menu opens on
 * hover, which is not worth it.
 *
 * The cost is honest and small: the preference is per browser, so
 * someone who uses the salon iMac and their own phone sets it twice.
 */
const KEY = "groomigo_sidebar_hover_v1";

/**
 * On by default, because that is how the sidebar shipped this morning
 * and a preference that silently changes behaviour for everyone who
 * never opens it is not a preference, it is a redesign.
 */
const DEFAULT = true;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === null ? DEFAULT : stored === "on";
  } catch {
    // Private windows and blocked site data throw rather than return
    // null. The sidebar still has to render.
    return DEFAULT;
  }
}

export function useSidebarHover(): { hoverOpens: boolean; setHoverOpens: (on: boolean) => void } {
  const [hoverOpens, setStored] = useState(DEFAULT);

  // Read after mount, not during render: the first paint has to match on
  // both sides of a hydration, and localStorage is not available on one.
  useEffect(() => { setStored(read()); }, []);

  // Two tabs open on the board is normal here, and a setting that only
  // takes in the tab you changed it in reads as not having saved.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === KEY) setStored(read());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setHoverOpens = useCallback((on: boolean) => {
    setStored(on);
    try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* nothing to do */ }
  }, []);

  return { hoverOpens, setHoverOpens };
}

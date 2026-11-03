import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "workflow-tv-mode";

/**
 * Whether THIS screen is being used as the salon's wall display.
 *
 * Lauren, 03/11/2026: "I don't know why the tv keeps changing from tv mode
 * to normal viewing. It's only been doing this today."
 *
 * TV mode used to be `useState(false)` on the workflow board, so it lasted
 * exactly as long as the page did — and the board deliberately reloads
 * itself in TV mode when a new build ships (`useBuildVersionReload`, added
 * 30/10/2026 because the wall screen had been running a weeks-old bundle).
 *
 * Those two together are the bug: the reload that exists to keep the TV
 * current is the thing that drops it back to the staff board. It needs a
 * deploy to show up, which is why it looked like it started "only today" —
 * that day had four of them, and most days have none.
 *
 * Stored per device, for the same reason the TV's light/dark choice is
 * (see `useDisplayTheme` next door): being the wall display is a property
 * of the screen in the corner, not of whoever last signed in on it. The
 * board's own TV header carries an Exit button, so a staff member who
 * turns this on by accident is one click from out of it rather than stuck
 * on every future visit.
 *
 * `/workflow/display` never had this problem and still does not — it is a
 * route, so reloading it lands back on itself. This only ever affected the
 * in-tab TV Preview, which is what the salon TV is actually showing.
 */
export function useTvMode() {
  const [tvMode, setTvMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      // Private browsing or blocked storage — default to the staff board,
      // which is the safe way to be wrong: visible, and one click to fix.
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, tvMode ? "on" : "off");
    } catch {
      /* not persisting is acceptable; the session still honours the choice */
    }
  }, [tvMode]);

  const enter = useCallback(() => setTvMode(true), []);
  const exit = useCallback(() => setTvMode(false), []);

  return { tvMode, setTvMode, enter, exit };
}

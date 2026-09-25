import { useCallback, useEffect, useState } from "react";

export type DisplayTheme = "light" | "dark";

const STORAGE_KEY = "workflow-display-theme";

/**
 * Light/dark preference for the workflow display surfaces — the wall-mounted TV
 * page and the TV-mode overlay on the workflow board.
 *
 * Light is the default: staff asked for the white background, and a bright
 * screen reads better in a lit salon. Dark stays available because the same page
 * is sometimes shown on a TV in a darker corner, where an all-white screen at
 * that size is glaring.
 *
 * The choice is stored per device rather than per user, which is the useful
 * granularity here: the salon TV keeps whatever it was set to, independently of
 * whichever staff member last signed in on it.
 */
export function useDisplayTheme() {
  const [theme, setTheme] = useState<DisplayTheme>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      // Private browsing or blocked storage — fall back to the default.
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* not persisting is acceptable; the session still honours the choice */
    }
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, setTheme, toggle, isDark: theme === "dark" };
}

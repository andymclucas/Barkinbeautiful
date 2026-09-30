import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Light / dark / follow-the-system, for the whole platform.
 *
 * Three states, not two, but the DEFAULT IS LIGHT and dark is opted into.
 * Following the device sounds better than it is here: the salon's staff have
 * always seen a light board, and half of them would have arrived to a dark
 * one purely because of a phone setting they made months ago for something
 * else. "Match my device" is offered in the menu for anyone who wants it,
 * and whatever is chosen is remembered per device.
 *
 * The class goes on <html> rather than a wrapper div so that portalled UI -
 * dialogs, popovers, dropdowns, toasts - is inside it. Radix renders those at
 * the end of <body>, so a wrapper would leave every dialog stubbornly light.
 *
 * The first paint is handled by an inline script in index.html, not here:
 * React mounts too late, and the flash of a white screen at 7am in a dim
 * salon is exactly what someone turns dark mode on to avoid.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "gsos-theme";

interface ThemeContextType {
  /** What the user chose, which may be "system". */
  theme: ThemeChoice;
  /** What is actually on screen right now. Never "system". */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeChoice) => void;
  /** Flips between light and dark, settling "system" to its opposite. */
  toggleTheme: () => void;
  /**
   * Claim dark for a surface that must be dark whatever the user chose - the
   * wall-mounted TV board, which keeps its own per-device setting because the
   * salon TV should look the same regardless of who is signed in.
   *
   * Call from an effect and release in the cleanup. Reference counted, so two
   * such surfaces cannot switch each other off.
   */
  setDarkSurface: (active: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const systemTheme = (): ResolvedTheme =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

/** The saved choice, or null when the person has never picked one. */
function readStored(): ThemeChoice | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Private browsing, or storage blocked. Fall back to the default rather
    // than refusing to render.
  }
  return null;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: React.ReactNode;
  defaultTheme?: ThemeChoice;
}) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStored() ?? defaultTheme);
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(systemTheme);
  const [darkSurfaces, setDarkSurfaces] = useState(0);

  // Follow the device while the choice is "system" - someone whose phone
  // switches at sunset should see the app switch with it, not on next load.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setSystemPref(e.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemPref : theme;

  // ONE owner of the class on <html>.
  //
  // The TV board and TV display used to set it themselves and remove it on
  // unmount, so opening the workflow board switched the whole app back to
  // light and leaving it stripped dark from every other page. React also runs
  // child effects before parent ones, so a page could never win against this
  // effect anyway. Surfaces now ask; this decides.
  const showDark = resolvedTheme === "dark" || darkSurfaces > 0;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", showDark);
    // Darkens the browser's own furniture too: scrollbars, form controls,
    // the text caret.
    root.style.colorScheme = showDark ? "dark" : "light";
  }, [showDark]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not worth failing the click over; the theme still applies this session.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const setDarkSurface = useCallback((active: boolean) => {
    setDarkSurfaces((n) => Math.max(0, n + (active ? 1 : -1)));
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme, setDarkSurface }),
    [theme, resolvedTheme, setTheme, toggleTheme, setDarkSurface],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

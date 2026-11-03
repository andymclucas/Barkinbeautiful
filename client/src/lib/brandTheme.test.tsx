import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyBrandTheme } from "./brandTheme";

/** The lightness of an oklch() custom property on <html>. */
const lightnessOf = (name: string) => {
  const value = document.documentElement.style.getPropertyValue(name).trim();
  return Number(value.replace(/oklch\(|\)/g, "").split(/\s+/)[0]);
};

describe("applyBrandTheme", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  it("uses light surfaces when the app is light", () => {
    cleanup = applyBrandTheme({ primary: "#d61572" });
    expect(lightnessOf("--background")).toBeGreaterThan(0.9);
  });

  it("uses dark surfaces when the app is dark", () => {
    document.documentElement.classList.add("dark");
    cleanup = applyBrandTheme({ primary: "#d61572" });
    expect(lightnessOf("--background")).toBeLessThan(0.3);
  });

  /**
   * The regression Megs hit on 28/10/2026: "my screen keeps doing
   * weird black lines". Her phone was in dark mode while the app was
   * light — which is the app's own default — and the theme asked
   * prefers-color-scheme instead of the class ThemeContext owns, so
   * dark greys were painted onto a light page.
   */
  it("stays light when the OS is dark but the app is not", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    // No "dark" class: ThemeContext has decided this page is light.
    cleanup = applyBrandTheme({ primary: "#d61572" });
    expect(lightnessOf("--background")).toBeGreaterThan(0.9);
  });

  it("repaints when the theme toggle flips the class", async () => {
    cleanup = applyBrandTheme({ primary: "#d61572" });
    expect(lightnessOf("--background")).toBeGreaterThan(0.9);

    document.documentElement.classList.add("dark");
    // MutationObserver callbacks are microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lightnessOf("--background")).toBeLessThan(0.3);
  });

  it("takes every property back off on cleanup", () => {
    const off = applyBrandTheme({ primary: "#d61572" });
    expect(document.documentElement.style.getPropertyValue("--primary")).not.toBe("");
    off();
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("");
  });
});

describe("switching mode leaves nothing behind", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; });

  const inlineValue = (name: string) =>
    document.documentElement.style.getPropertyValue(name).trim();

  it("does not leave a dark --card behind when the page goes light", async () => {
    /*
     * Andy, 03/11/2026, photographed a light page with dark cards and a
     * dark dropdown after coming back to the app.
     *
     * The two modes do not emit the same keys: dark sets --card and
     * --popover, light does not, because a light card is plain white and
     * index.css already says so. So painting dark and then light left
     * those two behind as inline styles holding dark values - and an
     * inline style beats the :root rule that would have supplied light.
     *
     * Nothing unmounts when this happens. The workflow board claims dark
     * through setDarkSurface and releasing it switches the mode in place,
     * so the cleanup that would have cleared them never runs.
     */
    document.documentElement.classList.add("dark");
    cleanup = applyBrandTheme({ primary: "#d61572" });
    expect(inlineValue("--card")).not.toBe("");

    // The same switch ThemeContext makes: the class changes, nothing
    // unmounts, and the MutationObserver repaints.
    document.documentElement.classList.remove("dark");
    await new Promise((r) => setTimeout(r, 0));

    expect(inlineValue("--card")).toBe("");
    expect(inlineValue("--popover")).toBe("");
  });

  it("still paints the tokens light mode does define", async () => {
    document.documentElement.classList.add("dark");
    cleanup = applyBrandTheme({ primary: "#d61572" });
    document.documentElement.classList.remove("dark");
    await new Promise((r) => setTimeout(r, 0));

    // --background is in both lists, so it must be present AND light.
    expect(inlineValue("--background")).not.toBe("");
    expect(lightnessOf("--background")).toBeGreaterThan(0.9);
  });

  it("puts them back when the page goes dark again", async () => {
    cleanup = applyBrandTheme({ primary: "#d61572" });
    expect(inlineValue("--card")).toBe("");

    document.documentElement.classList.add("dark");
    await new Promise((r) => setTimeout(r, 0));

    expect(inlineValue("--card")).not.toBe("");
    expect(lightnessOf("--card")).toBeLessThan(0.5);
  });
});

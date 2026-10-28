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

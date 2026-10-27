import { describe, it, expect } from "vitest";
import {
  brandRamp, brandTokens, readableOn, darkenUntilReadable,
  deriveAccent, deriveSidebar, normaliseHex, sidebarTokens, DEFAULT_BRAND,
} from "../shared/brandPalette";
import { contrastRatio, hexToOklch, oklchToHex } from "../shared/oklch";

/** Brands chosen to cover the shapes that break a naive implementation. */
const BRANDS = {
  salonPink: "#d61572",
  stockViolet: "#7c3aed",
  mutedNavy: "#1f3a5f",
  paleMint: "#9fe8c8",
  neonLime: "#c3ff00",
  black: "#000000",
  grey: "#6b6b6b",
};

describe("brandRamp", () => {
  it("runs light to dark, in eleven steps", () => {
    const ramp = brandRamp(BRANDS.salonPink);
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
    expect(Object.keys(ramp)).toHaveLength(11);
    let previous = 2;
    for (const step of steps) {
      const l = hexToOklch(ramp[step])!.l;
      expect(l).toBeLessThan(previous);
      previous = l;
    }
  });

  it("keeps the brand's hue at every step", () => {
    const brandHue = hexToOklch(BRANDS.mutedNavy)!.h;
    const ramp = brandRamp(BRANDS.mutedNavy);
    for (const step of [100, 300, 500, 700, 900] as const) {
      const colour = hexToOklch(ramp[step])!;
      // Hue is an ANGLE around the grey axis, so the nearer a step sits
      // to grey the less an 8-bit hex can pin it down: rounding the
      // palest step by one unit per channel swings it a degree or so.
      // That is quantisation, not drift, and at chroma 0.01 no eye sees
      // it — so the tolerance tracks chroma rather than pretending the
      // pale end can hold the same precision as the saturated end.
      const tolerance = colour.c >= 0.05 ? 1 : 4;
      expect(Math.abs(colour.h - brandHue), `step ${step}`).toBeLessThan(tolerance);
    }
  });

  /**
   * The point of scaling chroma rather than copying the reference
   * curve: a restrained brand must not arrive as a neon.
   */
  it("keeps a muted brand muted", () => {
    const muted = brandRamp(BRANDS.mutedNavy);
    const vivid = brandRamp(BRANDS.stockViolet);
    expect(hexToOklch(muted[600])!.c).toBeLessThan(hexToOklch(vivid[600])!.c);
  });

  /**
   * A black or greyscale logo reports a hue made of rounding noise.
   * Honouring it tints the whole app a faint random colour.
   */
  it("gives an achromatic brand a grey ramp, not a tinted one", () => {
    for (const step of [100, 500, 900] as const) {
      expect(hexToOklch(brandRamp(BRANDS.black)[step])!.c).toBeLessThan(0.005);
      expect(hexToOklch(brandRamp(BRANDS.grey)[step])!.c).toBeLessThan(0.005);
    }
  });

  it("always emits colours sRGB can show", () => {
    for (const brand of Object.values(BRANDS)) {
      for (const hex of Object.values(brandRamp(brand))) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("falls back rather than throwing on rubbish", () => {
    expect(brandRamp("not a colour")[700]).toBe(brandRamp(DEFAULT_BRAND.primary)[700]);
  });
});

describe("readableOn", () => {
  it("picks white on dark and ink on light", () => {
    expect(readableOn("#2b1830")).toBe("#ffffff");
    expect(readableOn("#f9d4e7")).not.toBe("#ffffff");
  });
});

describe("darkenUntilReadable", () => {
  /**
   * The accessibility clamp. A pale brand with white text is the
   * failure that ships silently — it looks fine to whoever picked the
   * colour and is unreadable to everyone else.
   */
  it("darkens a pale brand until white text works", () => {
    const fixed = darkenUntilReadable(BRANDS.paleMint, "#ffffff");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Still mint: it got darker, it did not change colour.
    expect(Math.abs(hexToOklch(fixed)!.h - hexToOklch(BRANDS.paleMint)!.h)).toBeLessThan(6);
  });

  it("leaves a brand that already passes exactly alone", () => {
    expect(darkenUntilReadable(BRANDS.salonPink, "#ffffff")).toBe(BRANDS.salonPink);
  });
});

describe("brandTokens", () => {
  it("overrides the Tailwind steps the client hardcodes", () => {
    const tokens = brandTokens({ primary: BRANDS.salonPink });
    // 28 client files name these directly; they are the reason the
    // dialogs did not follow the brand.
    expect(tokens["--color-violet-700"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens["--color-violet-300"]).toBeDefined();
    // The client portal's background washes, so the salon's own
    // customers see the brand and not the stock palette.
    expect(tokens["--color-pink-50"]).toBeDefined();
  });

  it("drives the shadcn tokens every Button and focus ring uses", () => {
    const tokens = brandTokens({ primary: BRANDS.salonPink });
    for (const name of ["--primary", "--primary-foreground", "--ring", "--brand-primary", "--brand-accent", "--brand-sidebar"]) {
      expect(tokens[name]).toMatch(/^oklch\(/);
    }
  });

  /**
   * The contract worth pinning. Which hex comes out will change with
   * the design; that a groomer can read the Save button will not.
   */
  it("keeps button text readable for every brand", () => {
    for (const [name, brand] of Object.entries(BRANDS)) {
      const tokens = brandTokens({ primary: brand });
      const background = oklchCssToHexish(tokens["--primary"]);
      const foreground = oklchCssToHexish(tokens["--primary-foreground"]);
      expect(contrastRatio(background, foreground), `${name} button`).toBeGreaterThanOrEqual(4.4);
    }
  });

  it("falls back to the default brand when nothing is set", () => {
    const tokens = brandTokens({});
    expect(tokens["--color-violet-700"]).toBe(brandRamp(DEFAULT_BRAND.primary)[700]);
  });

  it("ignores a stored value that is not a colour", () => {
    expect(brandTokens({ primary: "chartreuse-ish" })["--color-violet-700"])
      .toBe(brandRamp(DEFAULT_BRAND.primary)[700]);
  });

  it("uses an explicit accent and sidebar over the derived ones", () => {
    const explicit = brandTokens({ primary: BRANDS.salonPink, sidebar: "#101010" });
    const derived = brandTokens({ primary: BRANDS.salonPink });
    expect(explicit["--brand-sidebar"]).not.toBe(derived["--brand-sidebar"]);
  });
});

describe("derived surfaces", () => {
  it("builds a dark sidebar and a pale accent in the brand's hue", () => {
    const sidebar = hexToOklch(deriveSidebar(BRANDS.salonPink))!;
    const accent = hexToOklch(deriveAccent(BRANDS.salonPink))!;
    expect(sidebar.l).toBeLessThan(0.35);
    expect(accent.l).toBeGreaterThan(0.85);
    const brandHue = hexToOklch(BRANDS.salonPink)!.h;
    expect(Math.abs(sidebar.h - brandHue)).toBeLessThan(1);
    expect(Math.abs(accent.h - brandHue)).toBeLessThan(1);
  });

  it("keeps a greyscale brand's surfaces grey", () => {
    expect(hexToOklch(deriveSidebar(BRANDS.black))!.c).toBeLessThan(0.005);
    expect(hexToOklch(deriveAccent(BRANDS.grey))!.c).toBeLessThan(0.005);
  });
});

describe("normaliseHex", () => {
  it("accepts what a colour input produces and rejects the rest", () => {
    expect(normaliseHex("#D61572")).toBe("#d61572");
    expect(normaliseHex("#f08")).toBe("#ff0088");
    expect(normaliseHex("")).toBeNull();
    expect(normaliseHex(null)).toBeNull();
    expect(normaliseHex("rgb(1,2,3)")).toBeNull();
  });
});

/** The tokens are CSS; the assertions need a hex to compare contrast. */
function oklchCssToHexish(css: string): string {
  const [l, c, h] = css.replace(/oklch\(|\)/g, "").split(/\s+/).map(Number);
  return oklchToHex({ l, c, h });
}

describe("sidebarTokens", () => {
  it("puts light text on a dark sidebar and dark text on a pale one", () => {
    expect(sidebarTokens("#2b1830")["--color-sidebar-foreground"]).toContain("255,255,255");
    expect(sidebarTokens("#f4e9f7")["--color-sidebar-foreground"]).toContain("0,0,0");
  });

  /**
   * The case the old lightness threshold got wrong. A mid-tone brand
   * sits near whatever cutoff you pick, and picking wrong gives a
   * salon white navigation text on a cream sidebar.
   */
  it("decides a mid-tone sidebar by measured contrast", () => {
    for (const hex of ["#6b7f9e", "#8a7f6b", "#7a9e6b", "#9e6b8a"]) {
      const foreground = sidebarTokens(hex)["--color-sidebar-foreground"];
      const chosen = foreground.includes("255,255,255") ? "#ffffff" : "#140f17";
      const rejected = chosen === "#ffffff" ? "#140f17" : "#ffffff";
      expect(contrastRatio(hex, chosen), hex).toBeGreaterThanOrEqual(contrastRatio(hex, rejected));
    }
  });

  it("always emits the full set the sidebar reads", () => {
    const tokens = sidebarTokens("#2b1830");
    for (const name of [
      "--color-sidebar", "--color-sidebar-foreground", "--color-sidebar-accent",
      "--color-sidebar-accent-foreground", "--color-sidebar-border",
    ]) {
      expect(tokens[name]).toBeTruthy();
    }
  });

  it("is included in the full theme", () => {
    expect(brandTokens({ primary: "#d61572" })["--color-sidebar"]).toBeTruthy();
  });

  it("falls back rather than emitting an invalid colour", () => {
    expect(sidebarTokens("nonsense")["--color-sidebar"]).toBe(
      sidebarTokens(DEFAULT_BRAND.sidebar)["--color-sidebar"]);
  });
});

describe("light and dark modes", () => {
  /**
   * The theme is written as inline custom properties on the root
   * element, and inline styles beat the `.dark` block in index.css. A
   * theme that ignored the mode would therefore hand a dark-mode user
   * light surfaces — the kind of break that only shows up for the
   * people who use dark mode.
   */
  it("gives dark mode dark surfaces and light mode light ones", () => {
    const light = brandTokens({ primary: "#d61572" }, "light");
    const dark = brandTokens({ primary: "#d61572" }, "dark");
    const lightness = (css: string) => Number(css.replace(/oklch\(|\)/g, "").split(/\s+/)[0]);

    expect(lightness(light["--background"])).toBeGreaterThan(0.9);
    expect(lightness(dark["--background"])).toBeLessThan(0.3);
    expect(lightness(light["--foreground"])).toBeLessThan(0.3);
    expect(lightness(dark["--foreground"])).toBeGreaterThan(0.9);
  });

  it("tints the neutral surfaces with the brand's hue", () => {
    const hue = (css: string) => Number(css.replace(/oklch\(|\)/g, "").split(/\s+/)[2]);
    const brandHue = hexToOklch("#00a86b")!.h;
    for (const mode of ["light", "dark"] as const) {
      const tokens = brandTokens({ primary: "#00a86b" }, mode);
      for (const name of ["--background", "--muted", "--border", "--accent"]) {
        expect(Math.abs(hue(tokens[name]) - brandHue), `${mode} ${name}`).toBeLessThan(1);
      }
    }
  });

  it("keeps a greyscale brand's surfaces truly neutral", () => {
    const chroma = (css: string) => Number(css.replace(/oklch\(|\)/g, "").split(/\s+/)[1]);
    const tokens = brandTokens({ primary: "#000000" }, "light");
    for (const name of ["--background", "--muted", "--border"]) {
      expect(chroma(tokens[name]), name).toBe(0);
    }
  });

  /**
   * A brand dark enough to read on paper can vanish against a dark
   * surface. index.css lifts its own primary for dark mode; a salon's
   * brand gets the same treatment rather than being left to disappear.
   */
  it("lifts a dark brand so it carries on a dark surface", () => {
    const lightness = (css: string) => Number(css.replace(/oklch\(|\)/g, "").split(/\s+/)[0]);
    const navy = "#1f3a5f";
    expect(lightness(brandTokens({ primary: navy }, "dark")["--primary"]))
      .toBeGreaterThan(lightness(brandTokens({ primary: navy }, "light")["--primary"]));
    expect(lightness(brandTokens({ primary: navy }, "dark")["--primary"]))
      .toBeGreaterThanOrEqual(0.6);
  });

  it("keeps button text readable in both modes, for every brand", () => {
    for (const [name, brand] of Object.entries(BRANDS)) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = brandTokens({ primary: brand }, mode);
        const ratio = contrastRatio(
          oklchCssToHexish(tokens["--primary"]),
          oklchCssToHexish(tokens["--primary-foreground"]));
        expect(ratio, `${name} in ${mode}`).toBeGreaterThanOrEqual(4.4);
      }
    }
  });

  /**
   * Destructive means "this deletes something". A salon whose brand is
   * green must not get a green delete button.
   */
  it("never repaints the destructive colour", () => {
    for (const mode of ["light", "dark"] as const) {
      const tokens = brandTokens({ primary: "#00a86b" }, mode);
      expect(tokens["--destructive"]).toBeUndefined();
      expect(tokens["--destructive-foreground"]).toBeUndefined();
    }
  });

  it("leaves the card and popover surfaces alone in light mode", () => {
    // They are plain white paper; tinting them muddies every dialog.
    const light = brandTokens({ primary: "#d61572" }, "light");
    expect(light["--card"]).toBeUndefined();
    expect(light["--popover"]).toBeUndefined();
  });

  it("defaults to light when no mode is given", () => {
    expect(brandTokens({ primary: "#d61572" })).toEqual(
      brandTokens({ primary: "#d61572" }, "light"));
  });
});

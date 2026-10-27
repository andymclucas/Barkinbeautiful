import { describe, it, expect } from "vitest";
import { extractBuildId, isNewBuild } from "../shared/buildVersion";

const PRODUCTION_HTML = `<!doctype html><html><head>
  <script type="module" crossorigin src="/assets/index-CKCfpWYC.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-DBvmX35M.css">
</head><body><div id="root"></div></body></html>`;

describe("extractBuildId", () => {
  it("finds the entry bundle in a real index.html", () => {
    expect(extractBuildId(PRODUCTION_HTML)).toBe("index-CKCfpWYC.js");
  });

  it("is not fooled by the stylesheet beside it", () => {
    // The css is also hashed and also called index-*; only the script
    // is the version marker.
    expect(extractBuildId(PRODUCTION_HTML)).not.toContain("css");
  });

  /** Vite serves an unhashed entry in dev; the check must stand down. */
  it("returns null for a development page", () => {
    expect(extractBuildId('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
  });

  it("returns null for anything that is not the app", () => {
    for (const html of ["", "<html></html>", "not html at all", "<h1>502 Bad Gateway</h1>"]) {
      expect(extractBuildId(html), html).toBeNull();
    }
  });

  it("handles the attributes being in any order", () => {
    expect(extractBuildId('<script src="/assets/index-AbC123_-.js" type="module">'))
      .toBe("index-AbC123_-.js");
  });
});

describe("isNewBuild", () => {
  it("says yes only when both are known and they differ", () => {
    expect(isNewBuild("index-AAA.js", "index-BBB.js")).toBe(true);
    expect(isNewBuild("index-AAA.js", "index-AAA.js")).toBe(false);
  });

  /**
   * The case that matters for an unattended screen. A failed fetch, a
   * captive portal or a dev server all give a missing id, and
   * reloading on those would loop a TV nobody is standing next to.
   */
  it("never reloads on an unknown version", () => {
    expect(isNewBuild(null, "index-BBB.js")).toBe(false);
    expect(isNewBuild("index-AAA.js", null)).toBe(false);
    expect(isNewBuild(null, null)).toBe(false);
  });
});

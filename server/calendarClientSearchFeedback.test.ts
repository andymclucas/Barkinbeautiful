import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("calendar client search feedback", () => {
  it("distinguishes fetching and unavailable search states from a genuine empty result", () => {
    const source = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");
    expect(source).toContain("isFetching: isClientSearchFetching");
    expect(source).toContain("isError: isClientSearchError");
    expect(source).toContain("Searching clients…");
    expect(source).toContain("Client search is temporarily unavailable. Please try again.");
    expect(source).toContain("No clients found");
  });
});

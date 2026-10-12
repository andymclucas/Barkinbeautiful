import { describe, expect, it } from "vitest";
import {
  isValidRating, needsSalonAttention, normaliseComment, responseRate,
  reviewRouting, MAX_COMMENT_LENGTH, PUBLIC_REVIEW_THRESHOLD,
} from "@shared/reviewRequest";

const URL = "https://g.page/r/example/review";

describe("isValidRating", () => {
  it("accepts 1 to 5 and nothing else", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(isValidRating(n)).toBe(true);
    for (const n of [0, 6, -1, 4.5, "5", null, undefined, NaN]) expect(isValidRating(n as never)).toBe(false);
  });
});

describe("reviewRouting", () => {
  it("sends a happy client to the public review page", () => {
    const r = reviewRouting(5, URL, "Barkin Beautiful");
    expect(r.kind).toBe("public");
    if (r.kind === "public") expect(r.url).toBe(URL);
  });

  it("treats 4 as happy — the threshold is inclusive", () => {
    expect(reviewRouting(PUBLIC_REVIEW_THRESHOLD, URL, "X").kind).toBe("public");
    expect(reviewRouting(PUBLIC_REVIEW_THRESHOLD - 1, URL, "X").kind).toBe("private");
  });

  it("keeps an unhappy client in, and says the salon will read it", () => {
    // The point of the whole feature: hear it before it is public.
    const r = reviewRouting(2, URL, "Barkin Beautiful");
    expect(r.kind).toBe("private");
    expect(r.body).toContain("Barkin Beautiful");
    expect(JSON.stringify(r)).not.toContain(URL);
  });

  it("never shows a broken link when no public page is configured", () => {
    for (const url of [null, undefined, "", "   "]) {
      const r = reviewRouting(5, url, "Barkin Beautiful");
      expect(r.kind).toBe("thanks");
    }
  });

  it("names the salon from the caller, not from the code", () => {
    // Groomigo is sold to other salons.
    const r = reviewRouting(5, null, "Another Salon");
    expect(r.body).toContain("Another Salon");
    expect(r.body).not.toContain("Barkin");
  });
});

describe("needsSalonAttention", () => {
  it("is true exactly when the review stayed private", () => {
    for (const n of [1, 2, 3]) expect(needsSalonAttention(n)).toBe(true);
    for (const n of [4, 5]) expect(needsSalonAttention(n)).toBe(false);
  });
});

describe("normaliseComment", () => {
  it("is null for nothing, so an empty box is not stored as a comment", () => {
    for (const c of [null, undefined, "", "   ", "\n\t"]) expect(normaliseComment(c)).toBeNull();
  });

  it("trims and caps", () => {
    expect(normaliseComment("  lovely job  ")).toBe("lovely job");
    expect(normaliseComment("x".repeat(MAX_COMMENT_LENGTH + 50))!.length).toBe(MAX_COMMENT_LENGTH);
  });
});

describe("responseRate", () => {
  it("is the fraction who answered", () => {
    expect(responseRate(6418, 2453)).toBeCloseTo(0.382, 3);
  });

  it("is null rather than NaN or Infinity when nothing was sent", () => {
    // A salon that has sent nothing has no rate, which is not the same as 0%.
    expect(responseRate(0, 0)).toBeNull();
    expect(responseRate(0, 5)).toBeNull();
  });
});

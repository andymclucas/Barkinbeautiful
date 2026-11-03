import { describe, expect, it } from "vitest";
import { formatAuDate, parseAuDate } from "../shared/auDate";

/** Fixed, so the "this year" rule cannot drift with the real clock. */
const TODAY = new Date(2026, 10, 3); // 3 November 2026

describe("formatAuDate", () => {
  it("writes the day first, which is the whole point", () => {
    // The bug Lauren saw: the board read 11/03/2026 for the 3rd of November.
    expect(formatAuDate("2026-11-03")).toBe("03/11/2026");
  });

  it("keeps the leading zeroes, so the columns line up on the board", () => {
    expect(formatAuDate("2026-01-05")).toBe("05/01/2026");
  });

  it("handles a day that is unambiguous either way", () => {
    expect(formatAuDate("2026-07-07")).toBe("07/07/2026");
  });

  it("returns empty for nothing, rather than a fake date", () => {
    expect(formatAuDate("")).toBe("");
    expect(formatAuDate(null)).toBe("");
    expect(formatAuDate(undefined)).toBe("");
  });

  it("returns empty for a date that does not exist", () => {
    // Not "03/03/2026". new Date("2026-02-31") rolls into March, and a
    // field that silently corrects what it was given is worse than a blank.
    expect(formatAuDate("2026-02-31")).toBe("");
    expect(formatAuDate("2026-13-01")).toBe("");
    expect(formatAuDate("2026-00-10")).toBe("");
  });

  it("returns empty for anything that is not an ISO key", () => {
    expect(formatAuDate("03/11/2026")).toBe("");
    expect(formatAuDate("not a date")).toBe("");
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    expect(formatAuDate("2028-02-29")).toBe("29/02/2028");
    expect(formatAuDate("2026-02-29")).toBe("");
  });
});

describe("parseAuDate — the Australian reading", () => {
  it("reads 3/11 as November, not March", () => {
    expect(parseAuDate("3/11/2026", TODAY)).toBe("2026-11-03");
  });

  it("accepts it padded or not", () => {
    expect(parseAuDate("03/11/2026", TODAY)).toBe("2026-11-03");
    expect(parseAuDate("3/1/2026", TODAY)).toBe("2026-01-03");
  });

  it("does not mind which separator they used", () => {
    for (const text of ["3/11/2026", "3-11-2026", "3.11.2026", "3 11 2026"]) {
      expect(parseAuDate(text, TODAY)).toBe("2026-11-03");
    }
  });

  it("ignores surrounding space", () => {
    expect(parseAuDate("  3/11/2026  ", TODAY)).toBe("2026-11-03");
  });
});

describe("parseAuDate — the year", () => {
  it("fills in this year when none was typed", () => {
    // The salon types "3/11" for a date in the season it is working in.
    expect(parseAuDate("3/11", TODAY)).toBe("2026-11-03");
  });

  it("reads two digits as this century", () => {
    expect(parseAuDate("3/11/26", TODAY)).toBe("2026-11-03");
    expect(parseAuDate("3/11/05", TODAY)).toBe("2005-11-03");
  });

  it("takes four digits as written, including a past one", () => {
    // Staff dates of birth go through this field too.
    expect(parseAuDate("14/06/1988", TODAY)).toBe("1988-06-14");
  });
});

describe("parseAuDate — what is not a date yet", () => {
  it("returns null rather than guessing, so a half-typed date is not an error", () => {
    for (const partial of ["", "   ", "3", "3/", "/11"]) {
      expect(parseAuDate(partial, TODAY)).toBeNull();
    }
  });

  it("rejects a day that does not exist", () => {
    // The one that matters: this must not roll forward into March.
    expect(parseAuDate("31/02/2026", TODAY)).toBeNull();
    expect(parseAuDate("31/04/2026", TODAY)).toBeNull();
    expect(parseAuDate("0/11/2026", TODAY)).toBeNull();
    expect(parseAuDate("32/11/2026", TODAY)).toBeNull();
  });

  it("rejects a month that does not exist", () => {
    expect(parseAuDate("11/13/2026", TODAY)).toBeNull();
    expect(parseAuDate("11/00/2026", TODAY)).toBeNull();
  });

  it("rejects words", () => {
    expect(parseAuDate("tomorrow", TODAY)).toBeNull();
    expect(parseAuDate("3 Nov 2026", TODAY)).toBeNull();
  });

  it("handles a leap day both ways", () => {
    expect(parseAuDate("29/02/2028", TODAY)).toBe("2028-02-29");
    expect(parseAuDate("29/02/2026", TODAY)).toBeNull();
  });
});

describe("parseAuDate — pasting an ISO key", () => {
  it("accepts one unchanged, so a date copied from a URL need not be retyped", () => {
    expect(parseAuDate("2026-11-03", TODAY)).toBe("2026-11-03");
  });

  it("still rejects an impossible one", () => {
    expect(parseAuDate("2026-02-31", TODAY)).toBeNull();
  });
});

describe("the pair round-trips", () => {
  it("survives format -> parse for every day of a year", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(start + i * 86_400_000);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      expect(parseAuDate(formatAuDate(key), TODAY)).toBe(key);
    }
  });
});

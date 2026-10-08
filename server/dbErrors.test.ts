import { describe, expect, it } from "vitest";
import { isDuplicateEntryError } from "./dbErrors";

describe("spotting a duplicate-key error", () => {
  it("recognises what mysql2 throws", () => {
    expect(isDuplicateEntryError({ code: "ER_DUP_ENTRY", errno: 1062 })).toBe(true);
    expect(isDuplicateEntryError({ errno: 1062 })).toBe(true);
    expect(isDuplicateEntryError({ code: "ER_DUP_ENTRY" })).toBe(true);
  });

  it("finds it when Drizzle has wrapped the driver error", () => {
    const wrapped = new Error("Failed query") as Error & { cause?: unknown };
    wrapped.cause = { code: "ER_DUP_ENTRY", errno: 1062 };
    expect(isDuplicateEntryError(wrapped)).toBe(true);
  });

  it("does not swallow anything else", () => {
    // The point of being strict: a connection drop mid-charge must still
    // throw, or a payment silently goes unbooked.
    expect(isDuplicateEntryError({ code: "ECONNRESET" })).toBe(false);
    expect(isDuplicateEntryError({ errno: 1045 })).toBe(false);
    expect(isDuplicateEntryError(new Error("boom"))).toBe(false);
    expect(isDuplicateEntryError(null)).toBe(false);
    expect(isDuplicateEntryError("ER_DUP_ENTRY")).toBe(false);
  });

  it("survives a cause cycle", () => {
    const a = { code: "X" } as { code: string; cause?: unknown };
    a.cause = a;
    expect(isDuplicateEntryError(a)).toBe(false);
  });
});

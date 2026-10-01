import { describe, it, expect } from "vitest";
import {
  autoTextPhoneKey,
  classifyClaim,
  isDuplicateKeyError,
  describeClaim,
  MISSED_CALL_AUTO_TEXT,
} from "../shared/missedCallAutoText";

describe("autoTextPhoneKey", () => {
  it("normalises the formats Twilio and the client table actually produce", () => {
    // Twilio hands us E.164; sms_logs holds a mix of both spellings, which is
    // why one canonical key matters.
    expect(autoTextPhoneKey("+61427030788")).toBe("+61427030788");
    expect(autoTextPhoneKey("0427030788")).toBe("+61427030788");
    expect(autoTextPhoneKey("61427030788")).toBe("+61427030788");
    expect(autoTextPhoneKey("0427 030 788")).toBe("+61427030788");
    expect(autoTextPhoneKey("(04) 2703-0788")).toBe("+61427030788");
  });

  it("maps every spelling of one number onto the same key", () => {
    const keys = new Set(
      ["+61427030788", "0427030788", "61427030788", "0427 030 788", "+61 427 030 788"].map(
        autoTextPhoneKey,
      ),
    );
    expect(keys.size).toBe(1);
  });

  it("refuses withheld caller IDs instead of texting '+anonymous'", () => {
    // These produced real failed sends before: the old normaliser just
    // prefixed a "+" and handed the result to Twilio.
    expect(autoTextPhoneKey("anonymous")).toBeNull();
    expect(autoTextPhoneKey("+anonymous")).toBeNull();
    expect(autoTextPhoneKey("unknown")).toBeNull();
    expect(autoTextPhoneKey("restricted")).toBeNull();
    expect(autoTextPhoneKey("")).toBeNull();
    expect(autoTextPhoneKey(null)).toBeNull();
    expect(autoTextPhoneKey(undefined)).toBeNull();
  });

  it("refuses things that are not dialable numbers", () => {
    expect(autoTextPhoneKey("+123")).toBeNull();            // too short
    expect(autoTextPhoneKey("+1234567890123456")).toBeNull(); // too long for E.164
    expect(autoTextPhoneKey("sip:bob@example.com")).toBeNull();
    expect(autoTextPhoneKey("+6142703078a")).toBeNull();
  });

  it("keeps landlines - they are real numbers, the send simply fails once", () => {
    expect(autoTextPhoneKey("+61755516955")).toBe("+61755516955");
    expect(autoTextPhoneKey("0755516955")).toBe("+61755516955");
  });
});

describe("classifyClaim", () => {
  const base = { phoneKey: "+61427030788", databaseAvailable: true } as const;

  it("sends only when the claim insert won", () => {
    expect(classifyClaim({ ...base, insert: "won" })).toEqual({
      send: true,
      reason: "claimed",
    });
  });

  it("does not send when the number already holds a claim", () => {
    expect(classifyClaim({ ...base, insert: "duplicate" })).toEqual({
      send: false,
      reason: "already-sent",
    });
  });

  it("FAILS CLOSED when the database is unavailable", () => {
    // The old guard did the opposite: with no database it left
    // alreadySentBefore = false and texted the caller, every single call.
    expect(
      classifyClaim({ phoneKey: "+61427030788", databaseAvailable: false, insert: "not-attempted" }),
    ).toEqual({ send: false, reason: "no-database" });
  });

  it("FAILS CLOSED when the claim could not be written", () => {
    // A send whose record does not land is a guaranteed repeat next call.
    expect(classifyClaim({ ...base, insert: "error" })).toEqual({
      send: false,
      reason: "claim-failed",
    });
  });

  it("never sends to a number it cannot key", () => {
    for (const insert of ["won", "duplicate", "error", "not-attempted"] as const) {
      expect(classifyClaim({ phoneKey: null, databaseAvailable: true, insert }).send).toBe(false);
    }
  });

  it("sends at most once across a repeated sequence of calls", () => {
    // First call wins the claim; every later call from the same number is a
    // duplicate, whatever else is going on.
    const outcomes = (["won", "duplicate", "duplicate", "duplicate"] as const).map((insert) =>
      classifyClaim({ ...base, insert }),
    );
    expect(outcomes.filter((o) => o.send)).toHaveLength(1);
  });
});

describe("isDuplicateKeyError", () => {
  it("recognises the driver's duplicate-key signals", () => {
    expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
    expect(
      isDuplicateKeyError(new Error("Duplicate entry '1-+61427030788' for key 'uq_...'")),
    ).toBe(true);
  });

  it("recognises it through a drizzle wrapper", () => {
    const wrapped = Object.assign(new Error("Failed query"), {
      cause: { code: "ER_DUP_ENTRY", errno: 1062 },
    });
    expect(isDuplicateKeyError(wrapped)).toBe(true);
  });

  it("does not mistake other failures for a duplicate", () => {
    // This is the important direction: treating a connection error as
    // "already sent" would silently stop the text for a first-time caller,
    // and treating it as "not sent" would text someone twice.
    expect(isDuplicateKeyError(new Error("ECONNREFUSED"))).toBe(false);
    expect(isDuplicateKeyError({ code: "ER_NO_SUCH_TABLE" })).toBe(false);
    expect(isDuplicateKeyError({ errno: 1045 })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError("nope")).toBe(false);
  });

  it("terminates on a self-referential cause", () => {
    const e: Record<string, unknown> = { message: "boom" };
    e.cause = e;
    expect(isDuplicateKeyError(e)).toBe(false);
  });
});

describe("describeClaim", () => {
  it("names the reason a text was withheld, for every outcome", () => {
    const reasons = ["claimed", "already-sent", "not-dialable", "no-database", "claim-failed"] as const;
    for (const reason of reasons) {
      const claim = { send: reason === "claimed", reason } as Parameters<typeof describeClaim>[0];
      const line = describeClaim(claim, "+61427030788", "+61427030788");
      expect(line).toContain("[Twilio]");
      expect(line.length).toBeGreaterThan(20);
    }
  });

  it("falls back to the raw From when there is no key to show", () => {
    expect(describeClaim({ send: false, reason: "not-dialable" }, null, "+anonymous")).toContain(
      "+anonymous",
    );
  });
});

describe("MISSED_CALL_AUTO_TEXT", () => {
  it("is a single SMS segment's worth of sense and mentions a reply", () => {
    expect(MISSED_CALL_AUTO_TEXT).toContain("Barkin' Beautiful");
    expect(MISSED_CALL_AUTO_TEXT).toMatch(/reply text/i);
  });
});

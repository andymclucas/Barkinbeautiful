import { describe, expect, it } from "vitest";
import {
  codeState, codeExpiry, normaliseCode, isCompleteCode, verificationStillGood,
  buildVerificationEmail, CODE_LENGTH, MAX_ATTEMPTS, CODE_TTL_MINUTES,
} from "@shared/signupVerification";

const now = new Date("2026-10-07T10:00:00.000Z");
const fresh = { expiresAt: new Date("2026-10-07T10:10:00.000Z"), attempts: 0, verifiedAt: null };

describe("whether a code can still be tried", () => {
  it("allows a fresh one", () => {
    expect(codeState(fresh, now)).toEqual({ usable: true });
  });

  it("refuses one that has run out", () => {
    expect(codeState({ ...fresh, expiresAt: new Date("2026-10-07T09:59:59.000Z") }, now))
      .toEqual({ usable: false, reason: "expired" });
  });

  it("refuses after five wrong tries", () => {
    // Six digits is a million possibilities, which is nothing. The
    // attempt limit is what makes a short code safe, not its length.
    expect(codeState({ ...fresh, attempts: MAX_ATTEMPTS }, now))
      .toEqual({ usable: false, reason: "locked" });
    expect(codeState({ ...fresh, attempts: MAX_ATTEMPTS - 1 }, now)).toEqual({ usable: true });
  });

  it("refuses one already spent", () => {
    expect(codeState({ ...fresh, verifiedAt: now }, now))
      .toEqual({ usable: false, reason: "already_used" });
  });

  it("refuses when there is nothing at all", () => {
    expect(codeState(null, now)).toEqual({ usable: false, reason: "none" });
    expect(codeState(undefined, now)).toEqual({ usable: false, reason: "none" });
  });

  it("treats the exact expiry instant as expired, not valid", () => {
    expect(codeState({ ...fresh, expiresAt: now }, now)).toEqual({ usable: false, reason: "expired" });
  });
});

describe("what the person typed", () => {
  it("takes the digits out of however they pasted it", () => {
    // Mail clients break codes across a hyphen, and people paste spaces.
    expect(normaliseCode("123 456")).toBe("123456");
    expect(normaliseCode("123-456")).toBe("123456");
    expect(normaliseCode(" 1 2 3 4 5 6 ")).toBe("123456");
  });

  it("stops at six so a stray digit cannot shift the code", () => {
    expect(normaliseCode("1234567890")).toBe("123456");
  });

  it("knows when it is complete", () => {
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("")).toBe(false);
    expect(CODE_LENGTH).toBe(6);
  });
});

describe("how long a proven address stays proven", () => {
  it("is good straight after", () => {
    expect(verificationStillGood(now, now)).toBe(true);
    expect(verificationStillGood(new Date("2026-10-07T09:45:00.000Z"), now)).toBe(true);
  });

  it("goes stale rather than lasting all day", () => {
    // A proven address is a key to creating a tenant. One left lying
    // around is worth stealing.
    expect(verificationStillGood(new Date("2026-10-07T09:29:00.000Z"), now)).toBe(false);
  });

  it("is false for nothing, and for nonsense", () => {
    expect(verificationStillGood(null, now)).toBe(false);
    expect(verificationStillGood(undefined, now)).toBe(false);
    expect(verificationStillGood("not a date", now)).toBe(false);
  });
});

describe("the email", () => {
  it("puts the code in the subject, where a phone shows it", () => {
    const mail = buildVerificationEmail("481902");
    expect(mail.subject).toBe("481902 is your Groomigo code");
    expect(mail.html).toContain("481902");
    expect(mail.html).toContain(String(CODE_TTL_MINUTES));
  });

  it("says plainly that nothing was created, for somebody who did not ask", () => {
    expect(buildVerificationEmail("000000").html).toMatch(/nothing has been created/);
  });
});

describe("expiry window", () => {
  it("is fifteen minutes from issue", () => {
    expect(codeExpiry(now).toISOString()).toBe("2026-10-07T10:15:00.000Z");
  });
});

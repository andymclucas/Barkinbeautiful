import { describe, it, expect } from "vitest";
import {
  validateAudience, describeAudience, guardSend, needsTypedConfirmation,
  MAX_BODY_LENGTH, TYPED_CONFIRM_THRESHOLD, MEMBERSHIP_TIERS, MAX_RECIPIENTS_PER_SEND,
} from "@shared/massTextRecipients";

describe("validateAudience", () => {
  it("accepts a sane date range and rejects a backwards one", () => {
    expect(validateAudience({ kind: "booked_between", from: "2026-10-06", to: "2026-10-10" }).ok).toBe(true);
    const bad = validateAudience({ kind: "booked_between", from: "2026-10-10", to: "2026-10-06" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/before the start/);
  });

  it("rejects malformed dates rather than passing them to SQL", () => {
    expect(validateAudience({ kind: "booked_between", from: "6 Oct", to: "2026-10-10" }).ok).toBe(false);
    expect(validateAudience({ kind: "booked_between", from: "", to: "" }).ok).toBe(false);
  });

  it("requires a tier and trims it", () => {
    expect(validateAudience({ kind: "membership_tier", tier: "  " }).ok).toBe(false);
    const r = validateAudience({ kind: "membership_tier", tier: " gold " });
    expect(r.ok).toBe(true);
    if (r.ok && r.audience.kind === "membership_tier") expect(r.audience.tier).toBe("gold");
  });

  it("de-duplicates hand-picked ids and rejects an empty pick", () => {
    const r = validateAudience({ kind: "hand_picked", clientIds: [5, 5, 7, -1, 0] });
    expect(r.ok).toBe(true);
    if (r.ok && r.audience.kind === "hand_picked") expect(r.audience.clientIds).toEqual([5, 7]);
    expect(validateAudience({ kind: "hand_picked", clientIds: [] }).ok).toBe(false);
  });

  it("rejects nonsense", () => {
    expect(validateAudience(null).ok).toBe(false);
    expect(validateAudience({ kind: "everyone_everywhere" }).ok).toBe(false);
  });
});

describe("describeAudience", () => {
  it("reads as something a sender can check", () => {
    expect(describeAudience({ kind: "booked_between", from: "2026-10-06", to: "2026-10-10" }))
      .toBe("Clients booked between 2026-10-06 and 2026-10-10");
    expect(describeAudience({ kind: "hand_picked", clientIds: [1] })).toBe("1 hand-picked client");
    expect(describeAudience({ kind: "hand_picked", clientIds: [1, 2] })).toBe("2 hand-picked clients");
    expect(describeAudience({ kind: "all_active" })).toBe("Every active client");
  });
});

describe("guardSend", () => {
  const base = { body: "We are closed Monday.", recipientCount: 10, confirmedCount: 10 };

  it("passes a normal send", () => {
    expect(guardSend(base).ok).toBe(true);
  });

  it("refuses an empty or over-long message", () => {
    expect(guardSend({ ...base, body: "   " }).ok).toBe(false);
    expect(guardSend({ ...base, body: "x".repeat(MAX_BODY_LENGTH + 1) }).ok).toBe(false);
  });

  it("refuses when nobody matches", () => {
    expect(guardSend({ ...base, recipientCount: 0, confirmedCount: 0 }).ok).toBe(false);
  });

  it("refuses when the audience grew since the preview", () => {
    // Someone booked in between previewing and sending; the sender never
    // agreed to reach those people.
    const r = guardSend({ ...base, recipientCount: 14, confirmedCount: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not the 10 you confirmed/);
  });

  it("refuses when it would exceed the SMS balance", () => {
    const r = guardSend({ ...base, recipientCount: 300, confirmedCount: 300, smsBalance: 280 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/only 280 remain/);
  });

  it("allows a send that exactly spends the balance", () => {
    expect(guardSend({ ...base, recipientCount: 280, confirmedCount: 280, smsBalance: 280 }).ok).toBe(true);
  });

  it("ignores an unknown balance rather than blocking", () => {
    expect(guardSend({ ...base, smsBalance: null }).ok).toBe(true);
  });
});

describe("needsTypedConfirmation", () => {
  it("kicks in above the threshold only", () => {
    expect(needsTypedConfirmation(TYPED_CONFIRM_THRESHOLD)).toBe(false);
    expect(needsTypedConfirmation(TYPED_CONFIRM_THRESHOLD + 1)).toBe(true);
  });
});

describe("tightened validation", () => {
  it("rejects a tier that does not exist, rather than matching nobody", () => {
    // "goldd" used to pass validation, match zero rows, and read on screen
    // as "nobody qualifies" — which is a very different thing.
    const r = validateAudience({ kind: "membership_tier", tier: "goldd" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unknown tier/);
  });

  it("accepts the real tiers, case-insensitively", () => {
    for (const t of MEMBERSHIP_TIERS) {
      expect(validateAudience({ kind: "membership_tier", tier: t.toUpperCase() }).ok).toBe(true);
    }
  });

  it("rejects a date that matches the pattern but is not a day", () => {
    expect(validateAudience({ kind: "booked_between", from: "2026-02-30", to: "2026-03-01" }).ok).toBe(false);
    expect(validateAudience({ kind: "booked_between", from: "2026-13-01", to: "2026-13-02" }).ok).toBe(false);
  });

  it("refuses an audience bigger than one send should carry", () => {
    const r = guardSend({
      body: "hello", recipientCount: MAX_RECIPIENTS_PER_SEND + 1, confirmedCount: MAX_RECIPIENTS_PER_SEND + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/limit for one send/);
  });

  it("allows exactly the cap", () => {
    expect(guardSend({
      body: "hello", recipientCount: MAX_RECIPIENTS_PER_SEND, confirmedCount: MAX_RECIPIENTS_PER_SEND,
    }).ok).toBe(true);
  });
});

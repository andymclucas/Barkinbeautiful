import { describe, it, expect } from "vitest";
import { conversationTimeline, sameNumber, type ConversationSms, type ConversationCall } from "@shared/conversationTimeline";

const sms = (id: number, at: number, direction: "inbound" | "outbound" = "outbound"): ConversationSms =>
  ({ kind: "sms", id, at, direction, body: `m${id}` });
const call = (id: number, at: number): ConversationCall =>
  ({ kind: "call", id, at, direction: "inbound", body: `v${id}` });

describe("conversationTimeline", () => {
  it("reads oldest first, because the reply box is at the bottom", () => {
    const t = conversationTimeline([sms(1, 300), sms(2, 100)], [call(3, 200)]);
    expect(t.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it("puts a voicemail above the auto-reply it triggered", () => {
    // Both land in the same second; the reply must not float above the call.
    const t = conversationTimeline([sms(9, 1000)], [call(4, 1000)]);
    expect(t.map((e) => e.kind)).toEqual(["call", "sms"]);
  });

  it("keeps two messages in the same second in id order", () => {
    const t = conversationTimeline([sms(8, 500), sms(7, 500)], []);
    expect(t.map((e) => e.id)).toEqual([7, 8]);
  });

  it("copes with one side being empty", () => {
    expect(conversationTimeline([], [call(1, 10)]).map((e) => e.id)).toEqual([1]);
    expect(conversationTimeline([sms(1, 10)], []).map((e) => e.id)).toEqual([1]);
    expect(conversationTimeline([], [])).toEqual([]);
  });
});

describe("sameNumber", () => {
  it("matches the form Twilio sends against the form the client record holds", () => {
    expect(sameNumber("+61416207175", "0416207175")).toBe(true);
    expect(sameNumber("+61 416 207 175", "0416 207 175")).toBe(true);
  });

  it("does not match two different numbers", () => {
    expect(sameNumber("+61416207175", "0416207176")).toBe(false);
  });

  it("refuses to match on too few digits, rather than matching everything", () => {
    // A short or empty value must not collapse into a wildcard.
    expect(sameNumber("", "")).toBe(false);
    expect(sameNumber("1234", "1234")).toBe(false);
    expect(sameNumber(null, undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { classifyInboundReply, normaliseAustralianMobile, phoneMatchesInboundNumber, isSmsOptOutReply, isSmsOptInReply } from "./inboundSms";

describe("inbound SMS reply handling", () => {
  it("classifies only exact confirmation keywords as confirmation", () => {
    expect(classifyInboundReply(" yes ")).toBe("confirm");
    expect(classifyInboundReply("CONFIRM!")).toBe("confirm");
    expect(classifyInboundReply("I will be there")).toBe("unknown");
  });

  it("classifies only exact cancellation keywords as cancellation", () => {
    expect(classifyInboundReply("N")).toBe("cancel");
    expect(classifyInboundReply("cancelled.")).toBe("cancel");
    expect(classifyInboundReply("Can I cancel next week?")).toBe("unknown");
  });

  it("matches common Australian mobile number formats", () => {
    expect(normaliseAustralianMobile("0412 345 678")).toBe("+61412345678");
    expect(phoneMatchesInboundNumber("0412 345 678", "+61412345678")).toBe(true);
    expect(phoneMatchesInboundNumber("0412 345 678", "+61412999999")).toBe(false);
  });
});

describe("SMS opt-out detection", () => {
  it("recognises the keywords carriers honour", () => {
    for (const w of ["STOP", "stop", "Stop.", "UNSUBSCRIBE", "QUIT", "END", "OPT OUT"]) {
      expect(isSmsOptOutReply(w)).toBe(true);
    }
  });

  it("does not treat a sentence as an opt-out", () => {
    // "stop sending me the 7am one" is a conversation and must reach a human.
    expect(isSmsOptOutReply("stop sending me the 7am one")).toBe(false);
    expect(isSmsOptOutReply("Please stop")).toBe(false);
    expect(isSmsOptOutReply("")).toBe(false);
    expect(isSmsOptOutReply(null)).toBe(false);
  });

  it("recognises opting back in", () => {
    expect(isSmsOptInReply("START")).toBe(true);
    expect(isSmsOptInReply("unstop")).toBe(true);
    expect(isSmsOptInReply("no thanks")).toBe(false);
  });

  it("does not confuse an opt-out with an appointment reply", () => {
    expect(classifyInboundReply("CANCEL")).toBe("cancel");
    expect(isSmsOptOutReply("CANCEL")).toBe(false);
  });
});

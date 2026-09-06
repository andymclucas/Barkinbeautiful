import { describe, expect, it } from "vitest";
import { classifyInboundReply, normaliseAustralianMobile, phoneMatchesInboundNumber } from "./inboundSms";

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

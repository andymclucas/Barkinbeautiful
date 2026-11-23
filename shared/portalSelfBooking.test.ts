import { describe, expect, it } from "vitest";
import { decidePortalBooking, isClientPickableAddOn, MEMBER_EXTRAS_MESSAGE, memberServiceFor, PLAN_NOT_USABLE_MESSAGE } from "./portalSelfBooking";

describe("decidePortalBooking", () => {
  it("books a member's dog for its plan's groom, whatever was asked for", () => {
    expect(decidePortalBooking({ planState: "covered", memberService: "styled_groom", requestedService: "bath_only", addOnIds: [] }))
      .toEqual({ ok: true, serviceType: "styled_groom", member: true, addOnIds: [] });
  });

  it("sends a member to the salon for extras", () => {
    expect(decidePortalBooking({ planState: "covered", memberService: "classic_groom", requestedService: "classic_groom", addOnIds: [3] }))
      .toEqual({ ok: false, message: MEMBER_EXTRAS_MESSAGE });
  });

  it("refuses a dog whose plan cannot be used right now", () => {
    expect(decidePortalBooking({ planState: "on_plan_not_usable", memberService: null, requestedService: "classic_groom", addOnIds: [] }))
      .toEqual({ ok: false, message: PLAN_NOT_USABLE_MESSAGE });
  });

  it("lets a dog with no plan book a listed service with extras", () => {
    expect(decidePortalBooking({ planState: "none", memberService: null, requestedService: "bath_only", addOnIds: [4, 4, 7] }))
      .toEqual({ ok: true, serviceType: "bath_only", member: false, addOnIds: [4, 7] });
  });

  it("refuses a service the portal does not offer", () => {
    expect(decidePortalBooking({ planState: "none", memberService: null, requestedService: "daycare", addOnIds: [] }).ok).toBe(false);
  });

  it("caps the number of extras", () => {
    const many = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(decidePortalBooking({ planState: "none", memberService: null, requestedService: "classic_groom", addOnIds: many }).ok).toBe(false);
  });
});

describe("memberServiceFor", () => {
  it("maps a styled plan to a styled groom and anything else to classic", () => {
    expect(memberServiceFor("styled")).toBe("styled_groom");
    expect(memberServiceFor("classic")).toBe("classic_groom");
    expect(memberServiceFor(null)).toBe("classic_groom");
  });
});

describe("isClientPickableAddOn", () => {
  it("offers an active add-on with a fixed list price", () => {
    expect(isClientPickableAddOn({ isActive: 1, priceMode: "fixed", priceAud: "15.00" })).toBe(true);
  });
  it("hides quoted, inactive or unpriced add-ons", () => {
    expect(isClientPickableAddOn({ isActive: 1, priceMode: "quote", priceAud: null })).toBe(false);
    expect(isClientPickableAddOn({ isActive: 1, priceMode: "from", priceAud: "10.00" })).toBe(false);
    expect(isClientPickableAddOn({ isActive: 0, priceMode: "fixed", priceAud: "15.00" })).toBe(false);
    expect(isClientPickableAddOn({ isActive: true, priceMode: "fixed", priceAud: null })).toBe(false);
  });
});

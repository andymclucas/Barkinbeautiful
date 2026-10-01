import { describe, it, expect } from "vitest";
import {
  prepareClientProfile,
  normaliseAustralianPhoneForStorage,
  isPlausibleAustralianPhone,
  isPlausibleEmail,
} from "@shared/clientProfileEdit";

const ok = (over = {}) => ({ firstName: "Toni", lastName: "Constantini", ...over });

describe("normaliseAustralianPhoneForStorage", () => {
  it("keeps the local form the salon's records already use", () => {
    expect(normaliseAustralianPhoneForStorage("0427 030 788")).toBe("0427030788");
    expect(normaliseAustralianPhoneForStorage("(04) 2703-0788")).toBe("0427030788");
  });

  it("folds +61 and 61 back to a leading zero", () => {
    expect(normaliseAustralianPhoneForStorage("+61427030788")).toBe("0427030788");
    expect(normaliseAustralianPhoneForStorage("61427030788")).toBe("0427030788");
  });

  it("is empty for nothing", () => {
    expect(normaliseAustralianPhoneForStorage("")).toBe("");
    expect(normaliseAustralianPhoneForStorage(null)).toBe("");
  });
});

describe("isPlausibleAustralianPhone", () => {
  it("accepts mobiles and landlines in any typed form", () => {
    expect(isPlausibleAustralianPhone("0427 030 788")).toBe(true);
    expect(isPlausibleAustralianPhone("+61 427 030 788")).toBe(true);
    expect(isPlausibleAustralianPhone("0731234567")).toBe(true);
  });

  it("rejects the wrong length or a missing zero", () => {
    expect(isPlausibleAustralianPhone("427030788")).toBe(false);
    expect(isPlausibleAustralianPhone("04270307889")).toBe(false);
    expect(isPlausibleAustralianPhone("abc")).toBe(false);
  });
});

describe("isPlausibleEmail", () => {
  it("accepts ordinary addresses and rejects obvious rubbish", () => {
    expect(isPlausibleEmail("tonistlc@bigpond.com")).toBe(true);
    expect(isPlausibleEmail("holly.lucas@live.com.au")).toBe(true);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
    expect(isPlausibleEmail("a b@c.com")).toBe(false);
  });
});

describe("prepareClientProfile", () => {
  it("requires both names", () => {
    const r = prepareClientProfile({ firstName: "  ", lastName: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.firstName).toBeTruthy();
      expect(r.errors.lastName).toBeTruthy();
    }
  });

  it("turns blank optional fields into null, not empty strings", () => {
    const r = prepareClientProfile(ok({ email: "  ", phone: "", address: "   " }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBeNull();
      expect(r.value.phone).toBeNull();
      expect(r.value.address).toBeNull();
    }
  });

  it("trims names and lowercases the email", () => {
    const r = prepareClientProfile(ok({ firstName: "  Toni ", email: " Toni@BigPond.COM " }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.firstName).toBe("Toni");
      expect(r.value.email).toBe("toni@bigpond.com");
    }
  });

  it("reports a bad email and a bad phone without throwing", () => {
    const r = prepareClientProfile(ok({ email: "nope", phone: "123" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toBeTruthy();
      expect(r.errors.phone).toBeTruthy();
    }
  });

  it("rejects absurdly long values", () => {
    expect(prepareClientProfile(ok({ firstName: "a".repeat(101) })).ok).toBe(false);
    expect(prepareClientProfile(ok({ address: "a".repeat(501) })).ok).toBe(false);
  });

  it("accepts a complete, ordinary profile", () => {
    const r = prepareClientProfile({
      firstName: "Holly", lastName: "Lucas",
      email: "holly.lucas@live.com.au", phone: "+61 401 028 405",
      address: "12 Example St, Brisbane",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({
      firstName: "Holly", lastName: "Lucas",
      email: "holly.lucas@live.com.au", phone: "0401028405",
      address: "12 Example St, Brisbane",
    });
  });
});

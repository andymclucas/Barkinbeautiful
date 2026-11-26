import { describe, expect, it } from "vitest";
import { dialableNumber, smsHref, telHref } from "./phoneLinks";

describe("phone links", () => {
  it("strips spaces and punctuation", () => {
    expect(dialableNumber("0412 345 678")).toBe("0412345678");
    expect(dialableNumber("(07) 3123-4567")).toBe("0731234567");
  });

  it("keeps a leading plus", () => {
    expect(dialableNumber(" +61 412 345 678 ")).toBe("+61412345678");
  });

  it("gives nothing for a blank or junk number", () => {
    expect(dialableNumber(null)).toBeNull();
    expect(dialableNumber("")).toBeNull();
    expect(dialableNumber("n/a")).toBeNull();
    expect(smsHref("12")).toBeNull();
  });

  it("builds sms: and tel: links", () => {
    expect(smsHref("0412 345 678")).toBe("sms:0412345678");
    expect(telHref("0412 345 678")).toBe("tel:0412345678");
  });
});

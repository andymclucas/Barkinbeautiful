import { describe, expect, it } from "vitest";
import { phoneKey, textableNumbers } from "./textableNumbers";

describe("textableNumbers", () => {
  it("lists the client first, then each contact", () => {
    expect(textableNumbers(
      { name: "Marie Hodson", phone: "0421501493" },
      [{ name: "Tom Hodson", phone: "0400 111 222", relationship: "Husband" }, { name: "Jo", phone: "0400333444", relationship: null }],
    )).toEqual([
      { kind: "primary", name: "Marie Hodson", phone: "0421501493", label: "Primary contact" },
      { kind: "contact", name: "Tom Hodson", phone: "0400 111 222", label: "Husband" },
      { kind: "contact", name: "Jo", phone: "0400333444", label: "Additional contact" },
    ]);
  });

  it("drops a contact that is the same handset as the client, however it was typed", () => {
    expect(textableNumbers(
      { name: "Marie", phone: "0421 501 493" },
      [{ name: "Marie mobile", phone: "+61421501493" }],
    )).toHaveLength(1);
  });

  it("copes with a client who has no number", () => {
    expect(textableNumbers({ name: "Marie", phone: null }, [{ name: "Tom", phone: "0400111222" }]).map((n) => n.kind)).toEqual(["contact"]);
  });

  it("normalises numbers for comparison", () => {
    expect(phoneKey("+61 421 501 493")).toBe("0421501493");
    expect(phoneKey("0421-501-493")).toBe("0421501493");
  });
});

import { describe, expect, it } from "vitest";
import { cleanClientName, clientNameUpdate } from "./clientName";

describe("tidying a client's name", () => {
  it("drops spaces at the ends and doubles inside", () => {
    expect(cleanClientName("  Mc  Leod ")).toBe("Mc Leod");
  });

  it("leaves the spelling and capitals exactly as typed", () => {
    for (const name of ["McLeod", "van der Berg", "de Souza", "O'Brien", "Smith-Jones"]) {
      expect(cleanClientName(name)).toBe(name);
    }
  });

  it("cuts a name to what the column holds", () => {
    expect(cleanClientName("a".repeat(150))).toHaveLength(100);
  });

  it("treats nothing as an empty name", () => {
    expect(cleanClientName(null)).toBe("");
    expect(cleanClientName(undefined)).toBe("");
    expect(cleanClientName("   ")).toBe("");
  });
});

describe("the names to save", () => {
  it("saves a corrected surname", () => {
    expect(clientNameUpdate({ firstName: "Gill", lastName: " McNicol " })).toEqual({ ok: true, firstName: "Gill", lastName: "McNicol" });
  });

  it("refuses a blank first name", () => {
    const result = clientNameUpdate({ firstName: "   ", lastName: "McNicol" });
    expect(result.ok).toBe(false);
  });

  it("allows a blank last name, because some records only have one name", () => {
    expect(clientNameUpdate({ firstName: "Cher", lastName: "" })).toEqual({ ok: true, firstName: "Cher", lastName: "" });
  });

  it("changes nothing that was not sent", () => {
    expect(clientNameUpdate({})).toEqual({ ok: true });
    expect(clientNameUpdate({ lastName: "Lee" })).toEqual({ ok: true, lastName: "Lee" });
  });
});

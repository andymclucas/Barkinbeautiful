import { describe, expect, it } from "vitest";
import {
  phoneKey, emailKey, nameKey, findDuplicateGroups, suggestSurvivor,
  type MergeCandidate,
} from "@shared/clientMerge";
import { phoneMatchKey } from "@shared/moegoImport";

const client = (over: Partial<MergeCandidate> & { id: number }): MergeCandidate => ({
  firstName: "Megan", lastName: "Williamson", email: null, phone: null, ...over,
});

describe("phoneKey", () => {
  it("sees one mobile however it was typed", () => {
    const forms = ["0411652182", "+61411652182", "411652182", "0411 652 182", "(04) 1165 2182"];
    expect(new Set(forms.map(phoneKey)).size).toBe(1);
  });

  it("ignores something too short to be a number", () => {
    expect(phoneKey("1234")).toBe("");
    expect(phoneKey("")).toBe("");
    expect(phoneKey(null)).toBe("");
  });

  /**
   * The MoeGo import decides the same question with phoneMatchKey. If
   * the two ever disagree, one screen calls two records the same person
   * and the other does not.
   */
  it("agrees with the MoeGo import about whether two numbers are one", () => {
    for (const n of ["0411652182", "+61411652182", "0412787684"]) {
      expect(phoneKey(n)).toBe(phoneMatchKey(n));
    }
  });
});

describe("nameKey", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(nameKey("Anne-Marie", "O'Neil")).toBe(nameKey("anne marie", "oneil"));
  });
});

describe("findDuplicateGroups", () => {
  it("finds two records sharing a mobile", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, phone: "0411652182" }),
      client({ id: 2, phone: "+61411652182" }),
      client({ id: 3, phone: "0400000000", firstName: "Someone", lastName: "Else" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("phone");
    expect(groups[0].confidence).toBe("likely");
    expect(groups[0].clients.map(c => c.id)).toEqual([1, 2]);
  });

  it("finds two records sharing an email", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, email: "A@Example.com " }),
      client({ id: 2, email: "a@example.com" }),
    ]);
    expect(groups[0].reason).toBe("email");
    expect(groups[0].confidence).toBe("likely");
  });

  /**
   * The rule the real client book taught, 05/11/2026. Of ten groups
   * sharing contact details, three were couples on one email — Rob and
   * Carla Newman, Trevor and Melanie Morris, Andrew and Karen
   * Lavrencic — and one was two unrelated people who had shared a
   * phone. A household shares an address; that is what a household is.
   *
   * They still surface, because somebody should look. They are never
   * called likely.
   */
  it("does not call a couple sharing an email a duplicate", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, firstName: "Rob", lastName: "Newman", email: "n@example.com" }),
      client({ id: 2, firstName: "Carla", lastName: "Newman", email: "n@example.com" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("email");
    expect(groups[0].confidence).toBe("possible");
  });

  it("does not call two unrelated people on one phone a duplicate", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, firstName: "Katie", lastName: "Roberts", phone: "0400111222" }),
      client({ id: 2, firstName: "Maua", lastName: "Lagaaia", phone: "0400111222" }),
    ]);
    expect(groups[0].confidence).toBe("possible");
  });

  it("still calls the same name on the same phone likely", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, firstName: "Fay", lastName: "Johnstone", phone: "0400111222" }),
      client({ id: 2, firstName: "Fay", lastName: "Johnstone", phone: "0400111222" }),
    ]);
    expect(groups[0].confidence).toBe("likely");
  });

  /**
   * The rule that keeps this safe. Two people really can share a name —
   * so it is a prompt to look, never a finding.
   */
  it("never calls a name match likely", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, phone: "0400000001" }),
      client({ id: 2, phone: "0400000002" }),
    ]);
    expect(groups[0].reason).toBe("name");
    expect(groups[0].confidence).toBe("possible");
  });

  /** A record belongs to one group, found by its strongest signal. */
  it("does not report the same pair twice", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, phone: "0411652182", email: "a@b.com" }),
      client({ id: 2, phone: "0411652182", email: "a@b.com" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("phone");
  });

  it("says nothing about records that share nothing", () => {
    expect(findDuplicateGroups([
      client({ id: 1, firstName: "A", lastName: "One", phone: "0400000001" }),
      client({ id: 2, firstName: "B", lastName: "Two", phone: "0400000002" }),
    ])).toEqual([]);
  });

  it("ignores a blank phone rather than grouping everyone without one", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, phone: "", firstName: "A", lastName: "One" }),
      client({ id: 2, phone: null, firstName: "B", lastName: "Two" }),
      client({ id: 3, phone: "   ", firstName: "C", lastName: "Three" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("handles a household of three on one number", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, phone: "0411652182" }),
      client({ id: 2, phone: "0411652182" }),
      client({ id: 3, phone: "0411652182" }),
    ]);
    expect(groups[0].clients).toHaveLength(3);
  });

  it("puts the strong matches first", () => {
    const groups = findDuplicateGroups([
      client({ id: 1, firstName: "Same", lastName: "Name", phone: "0400000001" }),
      client({ id: 2, firstName: "Same", lastName: "Name", phone: "0400000002" }),
      client({ id: 3, firstName: "Fay", lastName: "Johnstone", phone: "0411652182" }),
      client({ id: 4, firstName: "Fay", lastName: "Johnstone", phone: "0411652182" }),
    ]);
    expect(groups[0].confidence).toBe("likely");
    expect(groups[1].confidence).toBe("possible");
  });
});

describe("suggestSurvivor", () => {
  it("keeps the record carrying the most history", () => {
    expect(suggestSurvivor([
      client({ id: 1, appointments: 2, pets: 1 }),
      client({ id: 2, appointments: 40, pets: 2, invoices: 30 }),
    ])).toBe(2);
  });

  /**
   * A portal login is the only thing here the CLIENT holds. Re-issuing
   * one means emailing a customer to explain, so it outranks counts.
   */
  it("keeps the one with a portal login even when it holds less", () => {
    expect(suggestSurvivor([
      client({ id: 1, appointments: 99, invoices: 99 }),
      client({ id: 2, hasPortal: true }),
    ])).toBe(2);
  });

  it("breaks a tie on the older record", () => {
    expect(suggestSurvivor([
      client({ id: 7, createdAt: "2026-05-01" }),
      client({ id: 3, createdAt: "2024-01-01" }),
    ])).toBe(3);
  });

  it("has nothing to suggest for an empty group", () => {
    expect(suggestSurvivor([])).toBeNull();
  });
});

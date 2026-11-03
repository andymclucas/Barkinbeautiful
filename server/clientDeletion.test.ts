import { describe, expect, it } from "vitest";
import { checkClientDeletion, describeDeletionRefusal } from "../shared/clientDeletion";

describe("checkClientDeletion", () => {
  it("allows an empty duplicate through", () => {
    expect(checkClientDeletion({})).toEqual({ canDelete: true, blockers: [] });
    expect(checkClientDeletion({ appointments: 0, invoices: 0, petsWithHistory: 0 }).canDelete).toBe(true);
  });

  /*
   * The whole point. 25 tables carry a client_id and most are NOT NULL,
   * so a cascade would not fail — it would succeed and take the salon's
   * financial record with it.
   */
  it("refuses anything that is money", () => {
    for (const key of ["payments", "invoices", "memberships", "storeCreditEntries"] as const) {
      const check = checkClientDeletion({ [key]: 1 });
      expect(check.canDelete, key).toBe(false);
      expect(check.blockers, key).toHaveLength(1);
    }
  });

  it("refuses anything that is history", () => {
    for (const key of ["appointments", "petsWithHistory", "packages", "agreements", "reviews", "smsMessages"] as const) {
      expect(checkClientDeletion({ [key]: 1 }).canDelete, key).toBe(false);
    }
  });

  /*
   * A text really was sent to a real person. Deleting the client would
   * delete the only record of what they were told.
   */
  it("treats a single text message as enough to stop a delete", () => {
    const check = checkClientDeletion({ smsMessages: 1 });
    expect(check.canDelete).toBe(false);
    expect(check.blockers[0]).toBe("1 text message on record");
  });

  /* A duplicate owner with an unused duplicate dog is the case this
     feature exists for, so a petless-or-historyless dog must not block. */
  it("does not count a dog that has never been booked in", () => {
    expect(checkClientDeletion({ petsWithHistory: 0 }).canDelete).toBe(true);
  });

  it("lists the expensive reason first", () => {
    const check = checkClientDeletion({ appointments: 3, payments: 2, reviews: 1 });
    expect(check.blockers[0]).toBe("2 payments taken");
    expect(check.blockers).toEqual(["2 payments taken", "3 appointments", "1 review"]);
  });

  it("says one thing singular and two things plural", () => {
    expect(checkClientDeletion({ appointments: 1 }).blockers[0]).toBe("1 appointment");
    expect(checkClientDeletion({ appointments: 2 }).blockers[0]).toBe("2 appointments");
    expect(checkClientDeletion({ storeCreditEntries: 1 }).blockers[0]).toBe("1 store credit entry");
    expect(checkClientDeletion({ storeCreditEntries: 4 }).blockers[0]).toBe("4 store credit entries");
  });

  it("ignores rubbish counts rather than blocking on them", () => {
    expect(checkClientDeletion({ appointments: NaN, invoices: undefined }).canDelete).toBe(true);
  });
});

describe("describeDeletionRefusal", () => {
  it("names the client, the reasons, and what to do instead", () => {
    const text = describeDeletionRefusal("Greg Blackaby", ["2 payments taken", "3 appointments"]);
    expect(text).toContain("Greg Blackaby");
    expect(text).toContain("2 payments taken, 3 appointments");
    expect(text).toMatch(/inactive|merge/i);
  });

  it("copes with a client who has no name on file", () => {
    expect(describeDeletionRefusal("", ["1 invoice"])).toContain("This client");
  });
});

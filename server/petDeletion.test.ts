import { describe, it, expect } from "vitest";
import { canDeletePet } from "../shared/petDeletion";

const none = { appointments: 0, memberships: 0, photos: 0, styleNotes: 0 };

describe("canDeletePet", () => {
  it("allows deleting a dog with no history at all", () => {
    // The case this exists for: a row added twice, or a typo. Until now
    // the only way to retire one was marking it dead — five of seven
    // "departed" dogs on 19/10/2026 were duplicates, not deaths.
    expect(canDeletePet(none)).toEqual({ canDelete: true });
  });

  it("refuses a dog that has been in the salon", () => {
    const out = canDeletePet({ ...none, appointments: 3 });
    expect(out.canDelete).toBe(false);
    expect(out.canDelete === false && out.reason).toContain("3 bookings");
  });

  it("points at Record passing only when the dog has actually been here", () => {
    // Saying "record a passing" about a duplicate row would be grim as
    // well as wrong.
    const withVisits = canDeletePet({ ...none, appointments: 1 });
    expect(withVisits.canDelete === false && withVisits.suggestPassing).toBe(true);
    expect(withVisits.canDelete === false && withVisits.reason).toContain("Record passing");

    const photoOnly = canDeletePet({ ...none, photos: 1 });
    expect(photoOnly.canDelete === false && photoOnly.suggestPassing).toBe(false);
    expect(photoOnly.canDelete === false && photoOnly.reason).not.toContain("Record passing");
  });

  it("refuses on a membership even with no bookings", () => {
    // Money is attached; deleting the dog would orphan it.
    expect(canDeletePet({ ...none, memberships: 1 }).canDelete).toBe(false);
  });

  it("names every blocker, so nobody deletes half the reason away", () => {
    const out = canDeletePet({ appointments: 2, memberships: 1, photos: 4, styleNotes: 3 });
    const reason = out.canDelete === false ? out.reason : "";
    for (const bit of ["2 bookings", "1 membership", "4 photos", "3 grooming notes"]) {
      expect(reason).toContain(bit);
    }
  });

  it("reads as a sentence for one, two and three blockers", () => {
    const one = canDeletePet({ ...none, photos: 1 });
    expect(one.canDelete === false && one.reason).toContain("has 1 photo on file");
    const two = canDeletePet({ ...none, photos: 1, styleNotes: 2 });
    expect(two.canDelete === false && two.reason).toContain("1 photo and 2 grooming notes");
    const three = canDeletePet({ ...none, memberships: 1, photos: 1, styleNotes: 1 });
    expect(three.canDelete === false && three.reason)
      .toContain("1 membership, 1 photo and 1 grooming note");
  });

  it("uses the singular where it should", () => {
    const out = canDeletePet({ ...none, appointments: 1 });
    expect(out.canDelete === false && out.reason).toContain("1 booking on file");
    expect(out.canDelete === false && out.reason).not.toContain("1 bookings");
  });
});

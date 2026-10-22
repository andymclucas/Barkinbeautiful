import { describe, expect, it } from "vitest";
import {
  clientDisplayName, describeSystemNotification, isSystemNotificationKind, listNames,
} from "@shared/systemNotifications";

describe("listNames", () => {
  it("joins the way a person would say it", () => {
    expect(listNames(["Rosie"])).toBe("Rosie");
    expect(listNames(["Rosie", "Teddy"])).toBe("Rosie and Teddy");
    expect(listNames(["Rosie", "Teddy", "Tyson"])).toBe("Rosie, Teddy and Tyson");
  });

  it("is empty for nothing, and ignores blanks", () => {
    expect(listNames([])).toBe("");
    expect(listNames(null)).toBe("");
    expect(listNames(["", "  ", "Rosie"])).toBe("Rosie");
  });
});

describe("clientDisplayName", () => {
  it("falls back rather than rendering an empty name", () => {
    expect(clientDisplayName({ kind: "client_portal_activated" })).toBe("A client");
    expect(clientDisplayName({ kind: "client_portal_activated", clientFirstName: "Julie", clientLastName: null }))
      .toBe("Julie");
  });
});

describe("describeSystemNotification", () => {
  it("names the client and their dogs", () => {
    // "Julie Noy" means little at a glance; "Rosie and Teddy" is immediate.
    const n = describeSystemNotification({
      kind: "client_portal_activated",
      clientFirstName: "Julie", clientLastName: "Noy", petNames: ["Rosie", "Teddy"],
    });
    expect(n.title).toBe("Julie Noy set up their client portal");
    expect(n.detail).toContain("Rosie and Teddy");
  });

  it("still reads properly for a client with no dogs on file", () => {
    const n = describeSystemNotification({
      kind: "client_portal_activated", clientFirstName: "Jane", clientLastName: "Smith", petNames: [],
    });
    expect(n.detail).not.toContain("for ");
    expect(n.detail).toMatch(/^They can now see their/);
  });

  it("renders an unknown kind rather than a blank row", () => {
    // A kind added to the enum but not yet to this file must not produce a
    // notification nobody can explain.
    const n = describeSystemNotification({ kind: "something_new", clientFirstName: "Jane", clientLastName: "Smith" });
    expect(n.title).toContain("Jane Smith");
    expect(n.title).toContain("something new");
  });
});

describe("isSystemNotificationKind", () => {
  it("accepts only the kinds the database knows", () => {
    expect(isSystemNotificationKind("client_portal_activated")).toBe(true);
    expect(isSystemNotificationKind("made_up")).toBe(false);
    expect(isSystemNotificationKind(null)).toBe(false);
  });
});

describe("staff kinds", () => {
  it("names the person invited and who invited them", () => {
    const n = describeSystemNotification({
      kind: "staff_invited", detail: "Bailey Clifford (bather)", actorName: "Lauren Romari",
    });
    expect(n.title).toBe("Bailey Clifford (bather) was invited to the platform");
    expect(n.detail).toContain("Lauren Romari");
    expect(n.detail).toContain("not accepted yet");
  });

  it("says when a login actually exists, which is the moment that matters", () => {
    const n = describeSystemNotification({
      kind: "staff_account_created", detail: "Bailey Clifford (bather)", actorName: null,
    });
    expect(n.title).toContain("now has a login");
    expect(n.detail).toBe("They can sign in from now on.");
  });

  it("still reads when nobody is named", () => {
    const n = describeSystemNotification({ kind: "staff_invited" });
    expect(n.title).toBe("Someone was invited to the platform");
    expect(n.detail).not.toMatch(/undefined|null/);
  });

  it("says a membership sign-up is waiting on somebody, not that it happened", () => {
    // Every other kind in this feed is news. This one is a client waiting,
    // and copy that reads like the others gets scrolled past.
    const n = describeSystemNotification({
      kind: "membership_signup_requested",
      clientFirstName: "Julie", clientLastName: "Noy",
      petNames: ["Rosie", "Teddy"],
      detail: "Silver + \u2014 $96.00 a week.",
    });
    expect(n.title).toBe("Julie Noy asked to join a membership");
    expect(n.detail).toContain("Rosie and Teddy");
    expect(n.detail).toContain("Silver +");
    expect(n.detail).toContain("Nothing is charged");
  });

  it("does not dangle a sentence for a sign-up with no dogs named", () => {
    const n = describeSystemNotification({ kind: "membership_signup_requested" });
    expect(n.title).toBe("A client asked to join a membership");
    expect(n.detail).not.toMatch(/undefined|null|For \./);
  });
});

/**
 * The public booking itself in is the only row in this feed written by a
 * stranger, and the only one where a number nobody has checked decides
 * what the salon charges.
 */
describe("online_booking_received", () => {
  it("names the client and the dog, because that is how the salon reads a row", () => {
    const n = describeSystemNotification({
      kind: "online_booking_received",
      clientFirstName: "Jane", clientLastName: "Smith",
      petNames: ["Rosie"],
      detail: "Classic groom, 12kg as entered, estimated $95.00.",
    });
    expect(n.title).toBe("Jane Smith booked Rosie in online");
    expect(n.detail).toContain("Classic groom, 12kg as entered, estimated $95.00.");
  });

  it("tells whoever opens it that the weight is unverified", () => {
    // The whole hazard of online booking in one line: the owner's own
    // figure picked the duration and the price.
    const n = describeSystemNotification({ kind: "online_booking_received" });
    expect(n.detail).toContain("check the weight");
  });

  it("still reads as a sentence with no dog and no detail", () => {
    const n = describeSystemNotification({ kind: "online_booking_received" });
    expect(n.title).toBe("A client booked in online");
    expect(n.detail).not.toMatch(/undefined|null/);
  });

  it("is a known kind", () => {
    expect(isSystemNotificationKind("online_booking_received")).toBe(true);
  });
});

describe("pet_passed_membership_review", () => {
  it("asks a question rather than telling anyone to cancel", () => {
    // "Stop the membership" is the wrong instinct about half the time —
    // the surviving dog's grooms are often prepaid through the same plan.
    const n = describeSystemNotification({
      kind: "pet_passed_membership_review",
      detail: "Teacup was recorded as passed away. The household still has 2 active memberships worth $49.00 a week — check whether they should move, stop or stay.",
    });
    expect(n.detail).toContain("should move, stop or stay");
    expect(n.detail).not.toMatch(/^cancel|must be cancelled/i);
  });

  it("leads with the dog's name, which is how the salon reads it", () => {
    const n = describeSystemNotification({
      kind: "pet_passed_membership_review",
      detail: "Teacup was recorded as passed away. The household still has 1 active membership.",
    });
    expect(n.title).toBe("Teacup — membership to review");
  });

  it("still renders with no detail recorded", () => {
    const n = describeSystemNotification({ kind: "pet_passed_membership_review" });
    expect(n.title).toBeTruthy();
    expect(n.detail).toBeTruthy();
    expect(`${n.title} ${n.detail}`).not.toMatch(/undefined|null/);
  });

  it("is a known kind", () => {
    expect(isSystemNotificationKind("pet_passed_membership_review")).toBe(true);
  });
});

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
});

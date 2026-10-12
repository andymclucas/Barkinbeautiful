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

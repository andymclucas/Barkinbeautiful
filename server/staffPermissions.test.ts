import { describe, it, expect } from "vitest";
import {
  STAFF_SECTIONS, STAFF_SECTION_KEYS, isStaffSection, parseSections,
  canEditSection, describeGrant, sectionLabel,
} from "../shared/staffPermissions";

/**
 * Access control, so it fails closed everywhere it can fail.
 */
describe("staff sections", () => {
  it("covers the ten sidebar sections in order, plus the mass-text capability", () => {
    // mass_text is not a sidebar entry. It is a capability inside Messages,
    // separated because reading the inbox and texting every client at once
    // are not the same permission — the second has no undo and a finite
    // SMS balance behind it. It shares the /messages path, so granting it
    // also unlocks the page, which is intended.
    expect(STAFF_SECTION_KEYS).toEqual([
      "appointments", "workflow", "pricing", "memberships", "clients",
      "analytics", "staff", "messages", "mass_text", "email_campaigns", "reporting",
    ]);
    // Every section must map to a real route, or a tick box grants nothing.
    for (const s of STAFF_SECTIONS) expect(s.path.startsWith("/")).toBe(true);
  });

  it("rejects anything that is not a known section", () => {
    expect(isStaffSection("appointments")).toBe(true);
    expect(isStaffSection("billing")).toBe(false);
    expect(isStaffSection("")).toBe(false);
    expect(isStaffSection(null)).toBe(false);
    expect(isStaffSection(["appointments"])).toBe(false);
  });
});

describe("parseSections", () => {
  it("reads an array or a JSON string", () => {
    expect(parseSections(["clients", "staff"])).toEqual(["clients", "staff"]);
    expect(parseSections('["clients","staff"]')).toEqual(["clients", "staff"]);
  });

  it("returns them in canonical order regardless of how they were stored", () => {
    expect(parseSections(["reporting", "appointments", "clients"]))
      .toEqual(["appointments", "clients", "reporting"]);
  });

  it("drops unknown entries rather than trusting them", () => {
    expect(parseSections(["clients", "everything", "', OR 1=1 --"])).toEqual(["clients"]);
  });

  it("de-duplicates", () => {
    expect(parseSections(["staff", "staff", "staff"])).toEqual(["staff"]);
  });

  it("fails CLOSED on anything malformed", () => {
    // A half-written column must never read as a grant.
    for (const bad of [null, undefined, "", "not json", "{}", '{"clients":true}', 42, true]) {
      expect(parseSections(bad)).toEqual([]);
    }
  });
});

describe("canEditSection", () => {
  it("needs admin rights AND the section ticked", () => {
    const grant = { isAdmin: true, adminSections: ["clients"] };
    expect(canEditSection(grant, "clients")).toBe(true);
    expect(canEditSection(grant, "staff")).toBe(false);
  });

  it("refuses when admin rights are off, however many sections are stored", () => {
    // Revoking rights must not require also clearing the tick boxes.
    expect(canEditSection({ isAdmin: false, adminSections: STAFF_SECTION_KEYS }, "clients")).toBe(false);
    expect(canEditSection({ isAdmin: null, adminSections: ["clients"] }, "clients")).toBe(false);
  });

  it("refuses admin rights with nothing ticked", () => {
    expect(canEditSection({ isAdmin: true, adminSections: [] }, "clients")).toBe(false);
    expect(canEditSection({ isAdmin: true, adminSections: null }, "clients")).toBe(false);
  });

  it("refuses a missing grant", () => {
    expect(canEditSection(null, "clients")).toBe(false);
    expect(canEditSection(undefined, "staff")).toBe(false);
  });
});

describe("describeGrant", () => {
  it("says what someone actually has", () => {
    expect(describeGrant(null)).toBe("No admin rights");
    expect(describeGrant({ isAdmin: false })).toBe("No admin rights");
    expect(describeGrant({ isAdmin: true, adminSections: [] })).toBe("Admin rights, no sections yet");
    expect(describeGrant({ isAdmin: true, adminSections: ["clients"] })).toBe("Admin rights: Clients");
    expect(describeGrant({ isAdmin: true, adminSections: ["clients", "staff"] }))
      .toBe("Admin rights: Clients and Staff");
    expect(describeGrant({ isAdmin: true, adminSections: ["appointments", "clients", "staff"] }))
      .toBe("Admin rights: Appointments, Clients and 1 more");
    expect(describeGrant({ isAdmin: true, adminSections: STAFF_SECTION_KEYS }))
      .toBe("Admin rights, every section");
  });

  it("labels sections the way the sidebar does", () => {
    expect(sectionLabel("pricing")).toBe("Pricing & Services");
    expect(sectionLabel("email_campaigns")).toBe("Email Campaigns");
  });
});

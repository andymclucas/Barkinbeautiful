import { describe, it, expect } from "vitest";
import {
  STAFF_SECTIONS, STAFF_SECTION_KEYS, isStaffSection, parseSections,
  canEditSection, describeGrant, sectionLabel,
  summariseGrant, STAFF_SECTION_KEYS,
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

describe("summariseGrant", () => {
  it("says plainly when there are no rights at all", () => {
    expect(summariseGrant(null)).toMatchObject({ isAdmin: false, sections: [], all: false, headline: "No admin rights" });
    expect(summariseGrant({ isAdmin: false, adminSections: ["clients"] }).sections).toEqual([]);
  });

  it("distinguishes rights-with-no-sections from no rights", () => {
    // Someone given rights and nothing ticked can change nothing, and the
    // card has to say which of the two states they are in.
    expect(summariseGrant({ isAdmin: true, adminSections: [] }).headline)
      .toBe("Admin rights, no sections yet");
  });

  it("counts a partial grant, because a wall of chips cannot be eyeballed", () => {
    const out = summariseGrant({ isAdmin: true, adminSections: ["clients", "staff", "reporting"] });
    expect(out.headline).toBe(`Admin rights, 3 of ${STAFF_SECTION_KEYS.length} sections`);
    expect(out.all).toBe(false);
    expect(out.labels).toEqual(["Clients", "Staff", "Reporting"]);
  });

  it("names a full grant as such rather than counting it", () => {
    const out = summariseGrant({ isAdmin: true, adminSections: [...STAFF_SECTION_KEYS] });
    expect(out.headline).toBe("Admin rights, every section");
    expect(out.all).toBe(true);
    expect(out.labels).toHaveLength(STAFF_SECTION_KEYS.length);
  });

  it("returns sections in canonical order whatever order they were stored in", () => {
    const out = summariseGrant({ isAdmin: true, adminSections: ["reporting", "appointments", "clients"] });
    expect(out.sections).toEqual(["appointments", "clients", "reporting"]);
  });

  it("drops anything that is not a real section, failing closed", () => {
    const out = summariseGrant({ isAdmin: true, adminSections: ["clients", "billing", 7, null] });
    expect(out.sections).toEqual(["clients"]);
  });

  it("reads a grant stored as a JSON string", () => {
    expect(summariseGrant({ isAdmin: true, adminSections: '["clients","staff"]' }).labels)
      .toEqual(["Clients", "Staff"]);
  });

  it("agrees with describeGrant on the two fixed states", () => {
    for (const grant of [null, { isAdmin: true, adminSections: [...STAFF_SECTION_KEYS] }]) {
      expect(summariseGrant(grant).headline).toBe(describeGrant(grant));
    }
  });
});

describe("the sections a grant does NOT include", () => {
  it("names the gap, which is the question when auditing", () => {
    const granted = STAFF_SECTION_KEYS.filter((k) => k !== "reporting");
    const out = summariseGrant({ isAdmin: true, adminSections: [...granted] });
    expect(out.missingLabels).toEqual(["Reporting"]);
    expect(out.headline).toBe(`Admin rights, ${granted.length} of ${STAFF_SECTION_KEYS.length} sections`);
  });

  it("has nothing missing on a full grant", () => {
    expect(summariseGrant({ isAdmin: true, adminSections: [...STAFF_SECTION_KEYS] }).missing).toEqual([]);
  });

  it("lists the gap in canonical order, not storage order", () => {
    const out = summariseGrant({ isAdmin: true, adminSections: ["clients"] });
    expect(out.missing[0]).toBe("appointments");
    expect(out.missing).toHaveLength(STAFF_SECTION_KEYS.length - 1);
  });

  it("reports no gap for someone with no rights at all", () => {
    // They are not missing sections, they have no grant — a different state.
    expect(summariseGrant({ isAdmin: false }).missing).toEqual([]);
  });
});

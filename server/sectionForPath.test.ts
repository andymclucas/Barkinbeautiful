import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  sectionForPath, SECTION_BY_NAMESPACE, UNGATED_PATHS, UNGATED_NAMESPACES,
} from "@shared/sectionForPath";
import { isStaffSection } from "@shared/staffPermissions";

/**
 * The map that decides whether a permission is real.
 *
 * `requireSection` lived in routers.ts with zero call sites, so every
 * tick box on the rights screen controlled nothing but sidebar links.
 * This replaces it, and the pinning test below is what stops the same
 * thing happening again by omission.
 */

/** Every namespace composed into appRouter, read from the source. */
function appRouterNamespaces(): string[] {
  const src = readFileSync(new URL("../server/routers.ts", import.meta.url), "utf8");
  const start = src.indexOf("export const appRouter");
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf("});", start));
  return [...block.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1]);
}

describe("every namespace is classified on purpose", () => {
  it("names a real section wherever it names one", () => {
    for (const section of Object.values(SECTION_BY_NAMESPACE)) {
      expect(isStaffSection(section)).toBe(true);
    }
  });

  it("maps or deliberately exempts every router in appRouter", () => {
    // A namespace missing from BOTH lists is ungated by accident, which
    // is how a permission screen ends up meaning nothing. Adding a router
    // must be a decision: gate it, or write it down as exempt here.
    const EXEMPT_BY_DESIGN = [
      // adminProcedure already gates these and a second check would only
      // add a way to be wrong.
      "settings", "migration", "stripeBilling", "stripeConnect", "onlineBooking",
      "payments", "stripeCards", "smsUsage",
      // Read-only surfaces: there is nothing to change.
      "analytics", "analyticsExt",
    ];
    const unclassified = appRouterNamespaces().filter((ns) =>
      !(ns in SECTION_BY_NAMESPACE)
      && !UNGATED_NAMESPACES.includes(ns)
      && !EXEMPT_BY_DESIGN.includes(ns));
    expect(unclassified).toEqual([]);
  });
});

describe("sectionForPath", () => {
  it("gates the obvious ones", () => {
    expect(sectionForPath("pricing.updateService")).toBe("pricing");
    expect(sectionForPath("calendar.createAppointment")).toBe("appointments");
    expect(sectionForPath("workflow.updateState")).toBe("workflow");
    expect(sectionForPath("staff.update")).toBe("staff");
    expect(sectionForPath("revenueTargets.set")).toBe("revenue_targets");
  });

  it("files a pet, a note and a photo under clients", () => {
    // They are all the client's record under different routers; one tick
    // box, or a bather can rewrite a dog by going the long way round.
    for (const p of ["pets.update", "clientNotes.create", "groomNotes.create",
      "clientPhotos.delete", "petPaperwork.upload", "family.link"]) {
      expect(sectionForPath(p)).toBe("clients");
    }
  });

  it("leaves creating a client open to everyone", () => {
    // Whoever answers the phone adds the client, bathers included.
    expect(sectionForPath("clients.create")).toBeNull();
    // But changing one that already exists is gated.
    expect(sectionForPath("clients.updateDetails")).toBe("clients");
  });

  it("leaves your own profile and signing in open", () => {
    expect(sectionForPath("staff.updateMyProfile")).toBeNull();
    expect(sectionForPath("auth.login")).toBeNull();
    expect(sectionForPath("auth.changePassword")).toBeNull();
    expect(sectionForPath("pushSubscriptions.subscribe")).toBeNull();
  });

  it("does not gate what it has not been told about", () => {
    // Fails open by design: a new router must not lock out the salon
    // until somebody notices.
    expect(sectionForPath("somethingBrandNew.create")).toBeNull();
    expect(sectionForPath("")).toBeNull();
  });

  it("every ungated path names a namespace that exists", () => {
    for (const p of UNGATED_PATHS) expect(p).toContain(".");
  });
});

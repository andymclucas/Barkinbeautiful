import { describe, expect, it } from "vitest";
import {
  buildAdminRightsEmail, buildPortalAccessEmail, buildRoleChangeEmail,
  describeAdminRightsChange, diffAdminRights, staffRoleLabel,
} from "@shared/staffAdminNotice";

const grant = (isAdmin: boolean, sections: string[] = []) => ({ isAdmin, adminSections: sections });

describe("diffAdminRights", () => {
  it("says nothing changed when nothing did", () => {
    // A no-op save must not send an email. The rights dialog can be opened
    // and closed without touching anything.
    const d = diffAdminRights(grant(true, ["clients"]), grant(true, ["clients"]));
    expect(d.changed).toBe(false);
  });

  it("spots rights being granted", () => {
    const d = diffAdminRights(grant(false), grant(true, ["clients"]));
    expect(d.grantedAdmin).toBe(true);
    expect(d.addedSections).toEqual(["clients"]);
    expect(d.changed).toBe(true);
  });

  it("spots rights being removed, and says nothing about sections", () => {
    // Sections survive a revoke so restoring brings them back. Listing them
    // as losses would describe one event as two.
    const d = diffAdminRights(grant(true, ["clients", "pricing"]), grant(false, ["clients", "pricing"]));
    expect(d.revokedAdmin).toBe(true);
    expect(d.removedSections).toEqual([]);
    expect(d.sectionsAfter).toEqual([]);
  });

  it("reports sections gained and lost in one change", () => {
    const d = diffAdminRights(grant(true, ["clients", "pricing"]), grant(true, ["clients", "staff"]));
    expect(d.addedSections).toEqual(["staff"]);
    expect(d.removedSections).toEqual(["pricing"]);
  });

  it("returns sections in the canonical order, not the order they were ticked", () => {
    const d = diffAdminRights(grant(true, []), grant(true, ["reporting", "appointments", "clients"]));
    expect(d.addedSections).toEqual(["appointments", "clients", "reporting"]);
  });

  it("ignores junk in the stored column rather than trusting it", () => {
    const d = diffAdminRights({ isAdmin: true, adminSections: "not json" }, grant(true, ["clients"]));
    expect(d.addedSections).toEqual(["clients"]);
  });

  it("treats a grant with no sections as a real change worth telling them about", () => {
    // They can see the admin UI appear; silence would be confusing.
    expect(diffAdminRights(grant(false), grant(true, [])).changed).toBe(true);
  });
});

describe("describeAdminRightsChange", () => {
  it("summarises a revoke in one clause", () => {
    expect(describeAdminRightsChange(diffAdminRights(grant(true, ["clients"]), grant(false))))
      .toBe("Admin rights removed");
  });

  it("summarises a grant with its sections, in the sidebar's own order", () => {
    // Not the order they were ticked, and not alphabetical: STAFF_SECTIONS
    // puts Pricing before Clients, and the email should read the way the
    // sidebar does.
    const d = diffAdminRights(grant(false), grant(true, ["clients", "pricing"]));
    expect(describeAdminRightsChange(d)).toBe("Admin rights granted; gained Pricing & Services and Clients");
  });

  it("summarises a section swap", () => {
    const d = diffAdminRights(grant(true, ["pricing"]), grant(true, ["clients"]));
    expect(describeAdminRightsChange(d)).toBe("gained Clients; lost Pricing & Services");
  });
});

describe("buildAdminRightsEmail", () => {
  const base = {
    staffName: "Megs", salonName: "Barkin Beautiful", productName: "Groomigo",
    actorName: "Lauren Romari", signInUrl: "https://staff.example.com",
  };

  it("names the salon from the caller, never from the code", () => {
    // Groomigo is sold to other salons; a hard-coded name would travel badly.
    const mail = buildAdminRightsEmail({ ...base, salonName: "Another Salon",
      change: diffAdminRights(grant(false), grant(true, ["clients"])) });
    expect(mail.subject).toContain("Another Salon");
    expect(mail.html).not.toContain("Barkin");
  });

  it("says who made the change", () => {
    const mail = buildAdminRightsEmail({ ...base, change: diffAdminRights(grant(false), grant(true, ["clients"])) });
    expect(mail.html).toContain("Lauren Romari");
  });

  it("copes with no actor name rather than printing undefined", () => {
    const mail = buildAdminRightsEmail({ ...base, actorName: null,
      change: diffAdminRights(grant(false), grant(true, ["clients"])) });
    expect(mail.html).not.toMatch(/undefined|null/);
  });

  it("reassures on a revoke that ordinary staff access is untouched", () => {
    const mail = buildAdminRightsEmail({ ...base, change: diffAdminRights(grant(true, ["clients"]), grant(false)) });
    expect(mail.subject).toContain("removed");
    expect(mail.html).toMatch(/usual staff access/i);
  });

  it("says plainly when a grant has no sections yet", () => {
    const mail = buildAdminRightsEmail({ ...base, change: diffAdminRights(grant(false), grant(true, [])) });
    expect(mail.html).toMatch(/No sections have been ticked/i);
  });

  it("escapes a name that would otherwise inject markup", () => {
    const mail = buildAdminRightsEmail({ ...base, staffName: '<img src=x onerror="alert(1)">',
      change: diffAdminRights(grant(false), grant(true, ["clients"])) });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });
});

describe("staffRoleLabel", () => {
  it("uses the salon's words, not the database's", () => {
    expect(staffRoleLabel("receptionist")).toBe("Receptionist");
    expect(staffRoleLabel("bather")).toBe("Bather");
  });

  it("passes an unknown role through rather than blanking it", () => {
    // A role added later should read as itself, not vanish from the email.
    expect(staffRoleLabel("apprentice")).toBe("apprentice");
    expect(staffRoleLabel(null)).toBe("");
  });
});

describe("buildRoleChangeEmail", () => {
  const base = { staffName: "Steph", salonName: "Barkin Beautiful", productName: "Groomigo",
    actorName: "Lauren Romari", signInUrl: "https://staff.example.com" };

  it("names both the old and the new role", () => {
    const mail = buildRoleChangeEmail({ ...base, fromRole: "bather", toRole: "groomer" });
    expect(mail.subject).toBe("Your role at Barkin Beautiful is now Groomer");
    expect(mail.html).toContain("Bather");
    expect(mail.html).toContain("Groomer");
  });

  it("copes when there was no previous role", () => {
    const mail = buildRoleChangeEmail({ ...base, fromRole: null, toRole: "manager" });
    expect(mail.html).toContain("You are now");
    expect(mail.html).not.toMatch(/undefined|null/);
  });

  it("says plainly that a role is not the same as admin rights", () => {
    // The two are separate grants and get separate emails; saying so stops
    // "I was made a manager, why can't I edit pricing".
    const mail = buildRoleChangeEmail({ ...base, fromRole: "groomer", toRole: "manager" });
    expect(mail.html).toMatch(/separate from admin rights/i);
  });

  it("takes the salon name from the caller", () => {
    const mail = buildRoleChangeEmail({ ...base, salonName: "Another Salon", fromRole: "bather", toRole: "groomer" });
    expect(mail.subject).toContain("Another Salon");
    expect(mail.html).not.toContain("Barkin");
  });
});

describe("buildPortalAccessEmail", () => {
  const base = { staffName: "Steph", salonName: "Barkin Beautiful", productName: "Groomigo",
    actorName: "Lauren Romari", signInUrl: "https://staff.example.com" };

  it("tells a revoked person they cannot sign in, and that nothing was deleted", () => {
    // Somebody whose login stops working assumes the system is broken.
    const mail = buildPortalAccessEmail({ ...base, action: "revoked" });
    expect(mail.subject).toMatch(/turned off/i);
    expect(mail.html).toMatch(/will not be able to sign in/i);
    expect(mail.html).toMatch(/nothing has been deleted/i);
  });

  it("passes the salon's note through, escaped", () => {
    const mail = buildPortalAccessEmail({ ...base, action: "revoked", note: '<b>left</b> on 1 Oct' });
    expect(mail.html).toContain("&lt;b&gt;left&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>left</b>");
  });

  it("omits the note line entirely when there is none", () => {
    const mail = buildPortalAccessEmail({ ...base, action: "revoked", note: null });
    expect(mail.html).not.toMatch(/Note from the salon/);
  });

  it("tells a restored person how to get back in", () => {
    const mail = buildPortalAccessEmail({ ...base, action: "restored" });
    expect(mail.subject).toMatch(/restored/i);
    expect(mail.html).toMatch(/usual email and password/i);
    expect(mail.html).toMatch(/forgotten-password/i);
  });
});

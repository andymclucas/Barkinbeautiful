import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  MOEGO_STAFF_ALIASES,
  describeStaffResolution,
  moegoStaffKey,
  normaliseStaffName,
  resolveMoegoStaff,
  resolveMoegoStaffForPets,
} from "@shared/moegoStaffAlias";

// The real roster on 14/10/2026.
const ROSTER = [
  { id: 1, name: "Lauren Romari", isActive: true },
  { id: 2, name: "Megs Graham", isActive: true },
  { id: 3, name: "Charlotte Purcell", isActive: true },
  { id: 6, name: "Ashleigh Knight", isActive: true },
  { id: 7, name: "Stephanie Baldwin", isActive: true },
  { id: 150001, name: "Nathan Romari", isActive: false },
];

describe("resolveMoegoStaff", () => {
  it("resolves a name that matches outright", () => {
    expect(resolveMoegoStaff("Charlotte Purcell", ROSTER)).toMatchObject({
      ok: true, staffId: 3, viaAlias: false,
    });
  });

  it("resolves the two names MoeGo uses for the bather", () => {
    // This is the whole bug. MoeGo books baths against generic logins, so
    // the baths were the bookings that lost their staff: 101 of the 107.
    for (const raw of ["Bather 1", "Bather", "BATHER 1", " bather  1 "]) {
      expect(resolveMoegoStaff(raw, ROSTER)).toMatchObject({
        ok: true, staffId: 7, staffName: "Stephanie Baldwin", viaAlias: true,
      });
    }
  });

  it("resolves Megan Graham, where neither name contains the other", () => {
    // A substring match misses this one entirely — it is why the map
    // exists rather than a clever comparison.
    expect(resolveMoegoStaff("Megan Graham", ROSTER)).toMatchObject({ ok: true, staffId: 2 });
    expect("Megs Graham".includes("Megan")).toBe(false);
  });

  it("reports an unknown name instead of returning nothing", () => {
    // The failure that mattered: the old scripts turned this into a null
    // staff id and inserted anyway, so the dog appeared on no column.
    const result = resolveMoegoStaff("Bather 2", ROSTER);
    expect(result).toMatchObject({ ok: false, kind: "unknown", normalised: "bather 2" });
    // There is no staffId on the failure, so it cannot be inserted by accident.
    expect("staffId" in result).toBe(false);
  });

  it("tells an empty cell apart from an unrecognised one", () => {
    // Nobody assigned in MoeGo is a real answer; a name nobody knows is a
    // problem. Collapsing them would hide the problem.
    expect(resolveMoegoStaff("", ROSTER)).toMatchObject({ ok: false, kind: "absent" });
    expect(resolveMoegoStaff("   ", ROSTER)).toMatchObject({ ok: false, kind: "absent" });
    expect(resolveMoegoStaff(null, ROSTER)).toMatchObject({ ok: false, kind: "absent" });
  });

  it("refuses to book somebody who has left", () => {
    expect(resolveMoegoStaff("Nathan Romari", ROSTER)).toMatchObject({
      ok: false, kind: "inactive", staffName: "Nathan Romari",
    });
  });

  it("never matches on a first name or a substring", () => {
    // A salon with an Ashleigh and an Ash would eventually file a dog
    // under the wrong person.
    expect(resolveMoegoStaff("Ashleigh", ROSTER)).toMatchObject({ ok: false, kind: "unknown" });
    expect(resolveMoegoStaff("Steph", ROSTER)).toMatchObject({ ok: false, kind: "unknown" });
  });
});

describe("the alias map itself", () => {
  it("is written in normalised form, or it can never match", () => {
    for (const [from, to] of Object.entries(MOEGO_STAFF_ALIASES)) {
      expect(from).toBe(normaliseStaffName(from));
      expect(to).toBe(normaliseStaffName(to));
    }
  });

  it("points every alias at somebody who actually works here", () => {
    // An alias to a name not on the roster resolves to "unknown" anyway,
    // which would look like a missing alias rather than a stale one.
    const names = new Set(ROSTER.map((m) => normaliseStaffName(m.name)));
    for (const to of Object.values(MOEGO_STAFF_ALIASES)) expect(names.has(to)).toBe(true);
  });

  it("leaves an unmapped name alone so it still shows up", () => {
    expect(moegoStaffKey("Brooklyn Cossey")).toBe("brooklyn cossey");
  });
});

describe("resolveMoegoStaffForPets", () => {
  it("gives one staff member to every dog on the booking", () => {
    // The normal family shape: MoeGo lists the person once for three dogs.
    const out = resolveMoegoStaffForPets("Bather 1", 3, ROSTER);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet).toHaveLength(3);
    for (const one of out.perPet) expect(one).toMatchObject({ ok: true, staffId: 7 });
  });

  it("aligns several names with several dogs by position", () => {
    const out = resolveMoegoStaffForPets("Megan Graham, Charlotte Purcell", 2, ROSTER);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet.map((r) => (r.ok ? r.staffId : null))).toEqual([2, 3]);
  });

  it("refuses to guess when the counts disagree", () => {
    // Trap 3: a name containing a comma cannot be split reliably, so a
    // row that does not line up goes to a human rather than being split
    // wrongly and filing a dog under the wrong groomer.
    expect(resolveMoegoStaffForPets("Megan Graham, Charlotte Purcell", 3, ROSTER))
      .toMatchObject({ ok: false, kind: "mismatch", petCount: 3 });
  });

  it("reports every dog as unassigned when MoeGo named nobody", () => {
    const out = resolveMoegoStaffForPets("", 2, ROSTER);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet.every((r) => !r.ok && r.kind === "absent")).toBe(true);
  });

  it("carries one dog's unknown name without poisoning the others", () => {
    const out = resolveMoegoStaffForPets("Charlotte Purcell, Bather 2", 2, ROSTER);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet[0]).toMatchObject({ ok: true, staffId: 3 });
    expect(out.perPet[1]).toMatchObject({ ok: false, kind: "unknown" });
  });
});

describe("describeStaffResolution", () => {
  it("says who, and says when it came through an alias", () => {
    expect(describeStaffResolution(resolveMoegoStaff("Bather 1", ROSTER)))
      .toBe('Stephanie Baldwin (MoeGo calls them "Bather 1")');
    expect(describeStaffResolution(resolveMoegoStaff("Charlotte Purcell", ROSTER)))
      .toBe("Charlotte Purcell");
  });

  it("says what to do about a name nobody knows", () => {
    expect(describeStaffResolution(resolveMoegoStaff("Bather 2", ROSTER)))
      .toContain("add an alias or stop");
  });
});

/**
 * Delegation check, in the sense CLAUDE.md §7 allows: it counts call sites
 * rather than asserting behaviour from source text.
 *
 * Each Monday's sync is a fresh script, copy-pasted from the last one, and
 * the alias map used to be copied with it. Three copies existed by
 * 14/10/2026 and two of them never knew "Bather", which is how 107
 * imported bookings ended up with nobody against them. A fourth copy would
 * do it again.
 */
describe("the alias map has one copy", () => {
  const scripts = readdirSync(new URL("../scripts/", import.meta.url))
    .filter((name) => name.endsWith(".ts"));

  it("is not redefined in any script", () => {
    const offenders = scripts.filter((name) => {
      const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
      return /const\s+STAFF_ALIAS\s*[:=]/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("is reached through the shared helper wherever staff names are compared", () => {
    const offenders = scripts.filter((name) => {
      const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
      // A local staffKey shadows the shared one and silently loses the map.
      return /const\s+staffKey\s*=/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});

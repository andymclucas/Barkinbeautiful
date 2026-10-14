import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  aliasIndex,
  describeStaffResolution,
  moegoStaffKey,
  normaliseStaffName,
  resolveMoegoStaff,
  resolveMoegoStaffForPets,
  type MoegoStaffAlias,
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

/** Barkin' Beautiful's rows, as `moego_staff_aliases` holds them. */
const ALIASES: MoegoStaffAlias[] = [
  { moegoName: "megan graham", staffId: 2 },
  { moegoName: "bather 1", staffId: 7 },
  { moegoName: "bather", staffId: 7 },
];

const NAMES: Record<number, string> = { 1: "Lauren", 2: "Megs", 3: "Charlotte", 7: "Stephanie", 99: "Nathan" };
const nameOf = (id: number) => NAMES[id] ?? `#${id}`;

const run = (staffIds: number[], roster = ROSTER, aliases = ALIASES) =>
  resolveMoegoStaff(
    staffIds.length ? "x" : "",
    roster,
    aliases,
  );

describe("resolveMoegoStaff", () => {
  it("resolves a name that matches the roster outright", () => {
    expect(resolveMoegoStaff("Charlotte Purcell", ROSTER, ALIASES))
      .toMatchObject({ ok: true, staffId: 3, viaAlias: false });
  });

  it("resolves the two names MoeGo uses for the bather", () => {
    // MoeGo books baths against generic logins, which is why the baths
    // were the bookings that lost their staff: 101 of the 107.
    for (const raw of ["Bather 1", "Bather", "BATHER 1", " bather  1 "]) {
      expect(resolveMoegoStaff(raw, ROSTER, ALIASES))
        .toMatchObject({ ok: true, staffId: 7, staffName: "Stephanie Baldwin", viaAlias: true });
    }
  });

  it("resolves Megan Graham, where neither name contains the other", () => {
    expect(resolveMoegoStaff("Megan Graham", ROSTER, ALIASES)).toMatchObject({ ok: true, staffId: 2 });
    expect("Megs Graham".includes("Megan")).toBe(false);
  });

  it("KEEPS WORKING when the staff member is renamed", () => {
    // The whole reason an alias points at an id. The map used to be
    // name-to-name, so renaming Steph to Stephanie Baldwin on 12/10/2026
    // meant moving the alias by hand or 383 bath bookings stopped
    // resolving. Rename her again and "Bather 1" still finds her.
    const renamed = ROSTER.map((m) => (m.id === 7 ? { ...m, name: "Steph B" } : m));
    expect(resolveMoegoStaff("Bather 1", renamed, ALIASES))
      .toMatchObject({ ok: true, staffId: 7, staffName: "Steph B" });
  });

  it("is another salon's aliases, not this one's", () => {
    // "bather 1" means Barkin' Beautiful's Stephanie and nothing anywhere
    // else. A second salon passes its own rows.
    const theirs: MoegoStaffAlias[] = [{ moegoName: "bather 1", staffId: 3 }];
    expect(resolveMoegoStaff("Bather 1", ROSTER, theirs)).toMatchObject({ ok: true, staffId: 3 });
  });

  it("falls back to plain name matching with no aliases at all", () => {
    expect(resolveMoegoStaff("Charlotte Purcell", ROSTER, [])).toMatchObject({ ok: true, staffId: 3 });
    expect(resolveMoegoStaff("Bather 1", ROSTER, [])).toMatchObject({ ok: false, kind: "unknown" });
  });

  it("reports an unknown name instead of returning nothing", () => {
    // The failure that mattered: the old scripts turned this into a null
    // staff id and inserted anyway, so the dog appeared on no column.
    const result = resolveMoegoStaff("Bather 2", ROSTER, ALIASES);
    expect(result).toMatchObject({ ok: false, kind: "unknown", normalised: "bather 2" });
    expect("staffId" in result).toBe(false);
  });

  it("tells an empty cell apart from an unrecognised one", () => {
    for (const raw of ["", "   ", null]) {
      expect(resolveMoegoStaff(raw, ROSTER, ALIASES)).toMatchObject({ ok: false, kind: "absent" });
    }
  });

  it("refuses to book somebody who has left", () => {
    expect(resolveMoegoStaff("Nathan Romari", ROSTER, ALIASES))
      .toMatchObject({ ok: false, kind: "inactive", staffName: "Nathan Romari" });
  });

  it("refuses an alias pointing at somebody who has left", () => {
    const stale: MoegoStaffAlias[] = [{ moegoName: "bather 1", staffId: 150001 }];
    expect(resolveMoegoStaff("Bather 1", ROSTER, stale)).toMatchObject({ ok: false, kind: "inactive" });
  });

  it("reports an alias pointing at a staff id that is gone", () => {
    const dangling: MoegoStaffAlias[] = [{ moegoName: "bather 1", staffId: 424242 }];
    expect(resolveMoegoStaff("Bather 1", ROSTER, dangling)).toMatchObject({ ok: false, kind: "unknown" });
  });

  it("never matches on a first name or a substring", () => {
    // A salon with an Ashleigh and an Ash would eventually file a dog
    // under the wrong person.
    expect(resolveMoegoStaff("Ashleigh", ROSTER, ALIASES)).toMatchObject({ ok: false, kind: "unknown" });
    expect(resolveMoegoStaff("Steph", ROSTER, ALIASES)).toMatchObject({ ok: false, kind: "unknown" });
  });
});

describe("aliasIndex", () => {
  it("normalises on the way in, so a stored row with odd spacing still matches", () => {
    const index = aliasIndex([{ moegoName: " Bather  1 ", staffId: 7 }]);
    expect(index.get("bather 1")).toBe(7);
  });

  it("leaves an unmapped name alone", () => {
    expect(moegoStaffKey("Brooklyn Cossey")).toBe("brooklyn cossey");
    expect(normaliseStaffName(" MEGS  graham ")).toBe("megs graham");
  });
});

describe("resolveMoegoStaffForPets", () => {
  it("gives one staff member to every dog on the booking", () => {
    const out = resolveMoegoStaffForPets("Bather 1", 3, ROSTER, ALIASES);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet).toHaveLength(3);
    for (const one of out.perPet) expect(one).toMatchObject({ ok: true, staffId: 7 });
  });

  it("aligns several names with several dogs by position", () => {
    const out = resolveMoegoStaffForPets("Megan Graham, Charlotte Purcell", 2, ROSTER, ALIASES);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet.map((r) => (r.ok ? r.staffId : null))).toEqual([2, 3]);
  });

  it("refuses to guess when the counts disagree", () => {
    // Trap 3: a name containing a comma cannot be split reliably, so a row
    // that does not line up goes to a human rather than filing a dog under
    // the wrong groomer.
    expect(resolveMoegoStaffForPets("Megan Graham, Charlotte Purcell", 3, ROSTER, ALIASES))
      .toMatchObject({ ok: false, kind: "mismatch", petCount: 3 });
  });

  it("reports every dog as unassigned when MoeGo named nobody", () => {
    const out = resolveMoegoStaffForPets("", 2, ROSTER, ALIASES);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet.every((r) => !r.ok && r.kind === "absent")).toBe(true);
  });

  it("carries one dog's unknown name without poisoning the others", () => {
    const out = resolveMoegoStaffForPets("Charlotte Purcell, Bather 2", 2, ROSTER, ALIASES);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.perPet[0]).toMatchObject({ ok: true, staffId: 3 });
    expect(out.perPet[1]).toMatchObject({ ok: false, kind: "unknown" });
  });
});

describe("describeStaffResolution", () => {
  it("says who, and says when it came through an alias", () => {
    expect(describeStaffResolution(resolveMoegoStaff("Bather 1", ROSTER, ALIASES), nameOf))
      .toBe('Stephanie Baldwin (MoeGo calls them "Bather 1")');
    expect(describeStaffResolution(resolveMoegoStaff("Charlotte Purcell", ROSTER, ALIASES), nameOf))
      .toBe("Charlotte Purcell");
  });

  it("says what to do about a name nobody knows", () => {
    expect(describeStaffResolution(resolveMoegoStaff("Bather 2", ROSTER, ALIASES), nameOf))
      .toContain("add an alias or stop");
  });
});

/**
 * Delegation check, in the sense CLAUDE.md §7 allows: it counts call sites
 * rather than asserting behaviour from source text.
 *
 * Each Monday's sync is a fresh script copy-pasted from the last, and the
 * alias map used to be copied with it. Three copies existed by 14/10/2026
 * and two never knew "Bather", which is how 107 imported bookings ended up
 * with nobody against them.
 */
describe("the aliases are data, not code", () => {
  const scripts = readdirSync(new URL("../scripts/", import.meta.url)).filter((n) => n.endsWith(".ts"));

  it("no script defines its own map", () => {
    const offenders = scripts.filter((name) => {
      const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
      return /const\s+STAFF_ALIAS\s*[:=]/.test(source) || /const\s+staffKey\s*=/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("the shared module hardcodes no salon's staff names", () => {
    // "bather 1" is Barkin' Beautiful's Stephanie and means nothing
    // anywhere else. It belongs in moego_staff_aliases, per tenant.
    const helper = readFileSync(new URL("../shared/moegoStaffAlias.ts", import.meta.url), "utf8");
    const code = helper.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const name of ["bather 1", "megan graham", "stephanie baldwin", "megs graham"]) {
      expect(code.toLowerCase()).not.toContain(name);
    }
  });
});

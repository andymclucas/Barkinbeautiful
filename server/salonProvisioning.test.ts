import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOGUE_LABELS, CATALOGUE_TABLES, COPYABLE_CATALOGUES, NEVER_COPY_TABLES,
  cataloguesToCopy, describeProvisionPlan, isCopyableCatalogue,
} from "../shared/salonProvisioning";

describe("what one salon may be seeded with from another", () => {
  it("copies catalogues only — never a person, a booking or a payment", () => {
    /*
     * The one failure in this feature that could not be undone by editing
     * a price afterwards. Everything copyable is a list the salon
     * maintains about its own services and vocabulary; one row of a
     * client, a pet, an appointment or an invoice crossing between
     * tenants is a data breach.
     */
    const copyable = Object.values(CATALOGUE_TABLES);
    for (const table of NEVER_COPY_TABLES) {
      expect(copyable, `${table} must never be copyable between salons`).not.toContain(table);
    }
  });

  it("names a table for every catalogue and nothing else", () => {
    // The copier reads only this map. A copier that took a table name as
    // an argument would be one typo away from copying clients.
    expect(Object.keys(CATALOGUE_TABLES).sort()).toEqual([...COPYABLE_CATALOGUES].sort());
    expect(Object.keys(CATALOGUE_LABELS).sort()).toEqual([...COPYABLE_CATALOGUES].sort());
  });

  it("refuses anything not on the list", () => {
    expect(isCopyableCatalogue("clients")).toBe(false);
    expect(isCopyableCatalogue("appointments")).toBe(false);
    expect(isCopyableCatalogue("")).toBe(false);
    expect(isCopyableCatalogue(null)).toBe(false);
    expect(isCopyableCatalogue("pricing")).toBe(true);
  });
});

describe("deciding what to copy", () => {
  it("copies nothing when there is no salon to copy from", () => {
    // Still creates the salon. An empty catalogue is a day's typing; a
    // failed provision on opening week is worse.
    expect(cataloguesToCopy({ copyFromTenantId: null, catalogues: COPYABLE_CATALOGUES }))
      .toEqual([]);
  });

  it("drops anything unrecognised rather than passing it through", () => {
    expect(cataloguesToCopy({
      copyFromTenantId: 1,
      catalogues: ["pricing", "clients", "appointments"] as never,
    })).toEqual(["pricing"]);
  });

  it("de-duplicates", () => {
    expect(cataloguesToCopy({ copyFromTenantId: 1, catalogues: ["retail", "retail"] }))
      .toEqual(["retail"]);
  });
});

describe("what the person is told before anything is written", () => {
  it("says plainly that no client data moves", () => {
    // The sentence somebody reads before pressing the button. It has to
    // answer the question they would otherwise have to ask.
    const plan = describeProvisionPlan({
      salonName: "The Pet Pad",
      copyFromName: "Barkin' Beautiful",
      catalogues: ["pricing", "petCodes"],
    });
    expect(plan).toContain("The Pet Pad");
    expect(plan).toContain("Barkin' Beautiful");
    expect(plan).toContain("No clients, pets or bookings are copied.");
  });

  it("reads as a sentence for one, two and three catalogues", () => {
    const of = (c: Parameters<typeof describeProvisionPlan>[0]["catalogues"]) =>
      describeProvisionPlan({ salonName: "X", copyFromName: "Y", catalogues: c });
    expect(of(["pricing"])).toContain("copying services and prices from Y");
    expect(of(["pricing", "retail"])).toContain("services and prices and retail products");
    expect(of(["pricing", "retail", "petCodes"]))
      .toContain("services and prices, retail products and grooming codes and shorthand");
  });

  it("says so when nothing is being copied", () => {
    expect(describeProvisionPlan({ salonName: "X", copyFromName: null, catalogues: ["pricing"] }))
      .toBe("Create X with an empty catalogue.");
    expect(describeProvisionPlan({ salonName: "X", copyFromName: "Y", catalogues: [] }))
      .toBe("Create X with an empty catalogue.");
  });
});

describe("the copier reads only the allow-list", () => {
  /*
   * A delegation check, which CLAUDE.md §7 allows for exactly this: it
   * proves the server goes through the shared rule rather than naming a
   * table itself. The rule it protects cannot be reached without two
   * salons and a database, and getting it wrong moves another salon's
   * clients.
   */
  const source = readFileSync(resolve(process.cwd(), "server/salonProvisioning.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("never names a forbidden table in its code", () => {
    for (const table of NEVER_COPY_TABLES) {
      // staff and users ARE created for the new salon, just never copied
      // from another one — so they are allowed to appear, and the test
      // above is what pins them out of the copyable set.
      if (table === "staff" || table === "users" || table === "salon_access") continue;
      expect(source, `the provisioner must not mention ${table}`).not.toContain(table);
    }
  });

  it("keys its tables by the catalogue union, so no string can reach another table", () => {
    /*
     * Stronger than a lookup by name, which is what this test first
     * asked for. `satisfies Record<CopyableCatalogue, unknown>` makes the
     * COMPILER require one entry per catalogue and reject any key that is
     * not one — so there is no string a caller could pass that resolves
     * to `clients`, and a new catalogue cannot be added without giving it
     * a table here.
     */
    expect(source).toContain("satisfies Record<CopyableCatalogue, unknown>");
    expect(source).toContain("TABLE_FOR[catalogue]");
    // And the decision about WHAT to copy still comes from the shared rule.
    expect(source).toContain("cataloguesToCopy");
  });

  it("strips the source salon's identity from every copied row", () => {
    // id so the rows get their own, tenantId so they belong to the new
    // salon, timestamps so the prices date from today rather than from
    // whenever the other salon last edited them.
    expect(source).toContain("id: _id");
    expect(source).toContain("tenantId: _tenantId");
    expect(source).toContain("tenantId: toTenantId");
  });
});

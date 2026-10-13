import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { clients } from "../drizzle/schema";
import { CLIENT_PUBLIC_COLUMNS } from "./clientColumns";

/**
 * What a client row is allowed to carry to the browser.
 *
 * `clients.list` and `clients.getById` used a bare `select()`, which
 * returns every column — so `portal_password_hash` and
 * `portal_setup_token_hash` were on the wire for every page of the client
 * list and every client profile. Nothing in the UI reads either, and the
 * setup-token hash is what gates taking over a client's portal account.
 *
 * Found on 13/10/2026 while opening the list to salon staff, which would
 * have widened it from two owners to every groomer.
 */
describe("CLIENT_PUBLIC_COLUMNS", () => {
  const whitelisted = Object.keys(CLIENT_PUBLIC_COLUMNS);
  const allColumns = Object.keys(getTableColumns(clients));

  /** Columns that must never reach a browser. */
  const SECRETS = ["portalPasswordHash", "portalSetupTokenHash"];

  it("excludes every secret", () => {
    for (const secret of SECRETS) {
      expect(allColumns).toContain(secret);        // still on the table
      expect(whitelisted).not.toContain(secret);   // never in the payload
    }
  });

  it("names only columns that exist", () => {
    // A typo here silently drops a field the page needs rather than
    // failing, so it is worth asserting.
    for (const name of whitelisted) expect(allColumns).toContain(name);
  });

  it("still carries what the client list and profile actually show", () => {
    for (const needed of [
      "id", "tenantId", "firstName", "lastName", "email", "phone",
      "address", "notes", "status", "referralSource",
      "portalAccountStatus", "stripeCardBrand", "createdAt",
    ]) {
      expect(whitelisted).toContain(needed);
    }
  });

  it("is a whitelist, so a new column is excluded until someone adds it", () => {
    // The point of listing columns rather than excluding secrets: the next
    // column with something sensitive in it does not join the payload by
    // default. If this fails, a column was added to `clients` — decide
    // whether the browser should see it, then update the list.
    const notWhitelisted = allColumns.filter((name) => !whitelisted.includes(name));
    expect(notWhitelisted.sort()).toEqual([
      "portalPasswordHash",
      "portalSessionVersion",
      "portalSetupTokenHash",
    ].sort());
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * drizzle's mysql2 driver returns the raw [rows, fields] pair from an
 * update, so the row count lives at result[0].affectedRows. Reading
 * result.affectedRows gives undefined, and `undefined ?? 0` is a very quiet
 * zero: the write succeeds and the guard behind it fires anyway.
 *
 * On 05/10/2026 that shipped in two places. completeSetup created the
 * client's portal account correctly and then told them "this setup link is
 * invalid or no longer active" — Andy hit it on a link ten seconds old.
 * revokeClientPortalAccess revoked the link and reported that it had not.
 *
 * A source check rather than a behavioural one, because the failure is a
 * property shape and there is no database in this suite. Narrow on purpose:
 * it only objects to reading affectedRows off something that is not indexed
 * first.
 */
const ROUTERS = readFileSync(join(__dirname, "routers.ts"), "utf8");

describe("affectedRows is read off the result array, not the result", () => {
  it("has no `.affectedRows` read directly on an update result", () => {
    // Matches `anything).affectedRows` or `anything.affectedRows` where the
    // thing before it is not an array index.
    const offenders = ROUTERS.split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\.affectedRows/.test(line))
      .filter(({ line }) => !/\[0\]\s*\??\.\s*affectedRows/.test(line))
      .filter(({ line }) => !line.startsWith("//") && !line.startsWith("*"));
    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });

  it("still reads it somewhere — the guard would be useless if it vanished", () => {
    expect(/\[0\]\s*\??\.\s*affectedRows/.test(ROUTERS)).toBe(true);
  });
});

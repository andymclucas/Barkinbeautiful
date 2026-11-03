import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * No native date input survives anywhere in the client.
 *
 * Lauren, 03/11/2026: "What's with the American date?" — the board read
 * 11/03/2026 for the 3rd of November. A native `<input type="date">`
 * renders in the BROWSER's locale and no HTML or CSS overrides it, so on
 * the salon's US-configured machine every date in the app was back to
 * front. The same is true of `datetime-local`.
 *
 * This is a DELEGATION check, in the sense CLAUDE.md §7 allows one: it
 * proves every date field goes through the shared control rather than
 * spot-checking a few that do. The assertion it replaces was
 * `expect(staffSource).toContain('type="date"')` — which asserted the
 * opposite of what the salon needs, and passed for exactly as long as the
 * bug existed.
 *
 * It counts, so it fails when a call site stops delegating AND when a new
 * native one is added. A grep that only checked "DateField appears
 * somewhere" would stay green while twenty native inputs sat beside it.
 *
 * WHEN THIS FAILS: a native date input has been added, or one has been
 * removed. If you are adding a date field, use DateField (a day) or
 * DateTimeField (a day and a time) — both are drop-in replacements taking
 * the same ISO `value`/`onChange` contract. If you genuinely need the
 * native control for a reason this file has not anticipated, say why here
 * and add it to ALLOWED.
 */

const CLIENT = new URL("../client/src/", import.meta.url).pathname;

/**
 * Files allowed to contain the string, because they are ABOUT it: the
 * replacements themselves and their tests, whose comments and assertions
 * quote what they replace.
 */
const ALLOWED = new Set([
  "components/DateField.tsx",
  "components/DateField.test.tsx",
  "components/DateTimeField.tsx",
  "components/DateTimeField.test.tsx",
]);

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) return walk(full, rel);
    return rel.endsWith(".tsx") || rel.endsWith(".ts") ? [rel] : [];
  });
}

const files = walk(CLIENT);
const offenders = files
  .filter((rel) => !ALLOWED.has(rel))
  .filter((rel) => /type=["']date["']|type=["']datetime-local["']/.test(
    readFileSync(join(CLIENT, rel), "utf8"),
  ));

describe("every date input goes through the shared control", () => {
  it("leaves no native date or datetime-local input in the client", () => {
    // Named rather than counted, so the failure says WHICH file to fix.
    expect(offenders).toEqual([]);
  });

  it("is actually looking at the client, not an empty list", () => {
    // A walk that silently returned nothing would make the test above pass
    // for the wrong reason, which is the standard way this shape of test
    // rots into decoration.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("pages/WorkflowBoard.tsx");
  });

  it("still has the replacements it is pointing people at", () => {
    expect(files).toContain("components/DateField.tsx");
    expect(files).toContain("components/DateTimeField.tsx");
  });
});

describe("the date controls are used, not merely present", () => {
  const usage = files
    .filter((rel) => !ALLOWED.has(rel))
    .map((rel) => readFileSync(join(CLIENT, rel), "utf8"))
    .join("\n");

  it("has the day control in use across the app", () => {
    // 27 call sites when the sweep landed: 26 that were <Input type="date">
    // plus the bare <input> on the client portal. The number is here so a
    // call site that quietly stops delegating is visible, not to be
    // precious about the exact figure — if you add or remove a date field,
    // move it in the same commit.
    const sites = usage.match(/<DateField\b/g) ?? [];
    expect(sites.length).toBeGreaterThanOrEqual(27);
  });

  it("has the day-and-time control in use", () => {
    // 6: a rebook slot, the booking dialog's end, the edit form's start and
    // end, and the two on the client record.
    const sites = usage.match(/<DateTimeField\b/g) ?? [];
    expect(sites.length).toBeGreaterThanOrEqual(6);
  });
});

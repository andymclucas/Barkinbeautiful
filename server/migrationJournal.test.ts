import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The migration ledger's invariants, checked by a test rather than by
 * whoever happens to look.
 *
 * `drizzle-kit migrate` decides what is pending with a STRICT
 * comparison — `Number(lastDbMigration.created_at) < folderMillis`
 * (drizzle-orm/mysql-core/dialect.js). A second entry carrying a `when`
 * that is already in the ledger is therefore not an error: it is
 * skipped, `migrate` exits 0, and the DDL never runs. The schema file
 * still declares the column, so every bare select and insert on that
 * table then names a column the database does not have.
 *
 * That is not hypothetical. On 29/10/2026 a parked stash held
 * `0147_appointment_prepaid` with idx 147 and `when` 1791834787562 —
 * the same idx and the same millisecond as
 * `0147_timing_review_wait_minutes`. Whichever applied first would have
 * silently disqualified the other, and the appointments one would have
 * taken the salon floor down (CLAUDE.md §6).
 *
 * Because migrations are hand-written here — `drizzle-kit generate` is
 * unusable until the snapshot chain is repaired — nothing else enforces
 * any of this.
 */

const DIR = join(import.meta.dirname, "..", "drizzle");
const journal = JSON.parse(readFileSync(join(DIR, "meta", "_journal.json"), "utf8")) as {
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
};

describe("the migration journal", () => {
  it("numbers every entry once, in order, with no gaps", () => {
    const idxs = journal.entries.map((e) => e.idx);
    expect(idxs).toEqual(idxs.map((_, i) => i));
  });

  /** The one that bites: equal is as bad as backwards. */
  it("gives every entry a strictly later timestamp than the one before", () => {
    const offenders = journal.entries
      .filter((e, i) => i > 0 && e.when <= journal.entries[i - 1].when)
      .map((e) => `${e.tag} (when ${e.when}) does not advance on ${journal.entries[e.idx - 1].tag}`);
    expect(offenders).toEqual([]);
  });

  it("never reuses a timestamp anywhere in the journal", () => {
    const seen = new Map<number, string>();
    const clashes: string[] = [];
    for (const e of journal.entries) {
      const prior = seen.get(e.when);
      if (prior) clashes.push(`${e.tag} shares when ${e.when} with ${prior}`);
      seen.set(e.when, e.tag);
    }
    expect(clashes).toEqual([]);
  });

  it("pairs every entry with exactly one .sql file, and vice versa", () => {
    const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
    const inJournal = journal.entries.map((e) => e.tag).sort();
    expect(inJournal).toEqual(onDisk);
  });

  it("keeps the shape every applied entry already has", () => {
    for (const e of journal.entries) {
      expect(e.version, e.tag).toBe("5");
      expect(e.breakpoints, e.tag).toBe(true);
      expect(e.tag, String(e.idx)).toMatch(/^\d{4}_[a-z0-9_]+$/);
      expect(Number(e.tag.slice(0, 4)), e.tag).toBe(e.idx);
    }
  });

  /**
   * A ledger row's hash is the sha256 of the file's full contents, so
   * an applied migration can never be edited. Nothing here can prove
   * what has been applied — only that no file is empty, which would
   * record a no-op as done.
   */
  it("has no empty migration", () => {
    const empty = journal.entries.filter((e) => {
      const body = readFileSync(join(DIR, `${e.tag}.sql`), "utf8");
      return body.replace(/--[^\n]*/g, "").trim().length === 0;
    });
    expect(empty.map((e) => e.tag)).toEqual([]);
  });
});

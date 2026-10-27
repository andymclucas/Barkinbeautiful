import { describe, it, expect } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { missedCallSearchFilter } from "./missedCallSearchFilter";
import { parseMessageSearch } from "@shared/messageSearch";

/**
 * Renders the filter exactly as the database would receive it.
 *
 * Same approach as messageSearchFilter.test.ts, and for the same
 * reason: that filter's term parsing was fully covered while every
 * search failed, because the bug lived in the SQL built from the term
 * and nothing looked at the SQL.
 */
const dialect = new MySqlDialect();
const render = (term: string) => {
  const filter = missedCallSearchFilter(parseMessageSearch(term));
  return filter ? dialect.sqlToQuery(filter) : null;
};

describe("missedCallSearchFilter", () => {
  it("adds no filter at all when there is nothing to search for", () => {
    // Not a filter matching everything — none, so the list is unchanged.
    expect(missedCallSearchFilter(parseMessageSearch(""))).toBeNull();
    expect(missedCallSearchFilter(parseMessageSearch(" "))).toBeNull();
    expect(missedCallSearchFilter(parseMessageSearch("a"))).toBeNull();
  });

  it("produces SQL with balanced quotes", () => {
    for (const term of ["Harvey", "0427 030 788", "100%", "under_score", "o'brien"]) {
      const q = render(term)!;
      const quotes = (q.sql.match(/'/g) ?? []).length;
      expect(quotes % 2, `${term} -> ${q.sql}`).toBe(0);
    }
  });

  /** The whole point of searching voicemails: what was actually said. */
  it("searches the transcript", () => {
    expect(render("surgery")!.sql).toContain("transcript_text");
  });

  it("searches the caller's own name as well as the client record", () => {
    const q = render("Christina")!;
    expect(q.sql).toContain("caller_name");
    expect(q.sql).toContain("first_name");
    expect(q.sql).toContain("last_name");
  });

  it("searches the client's dogs", () => {
    expect(render("Gismo")!.sql).toContain("pets");
  });

  it("matches a number however it was written", () => {
    const q = render("0427 030 788")!;
    // Punctuation is stripped from the stored value too: Twilio delivers
    // +61427030788 and nobody types it that way.
    expect(q.sql).toContain("REPLACE");
    expect(q.params.some((p) => String(p).includes("427030788"))).toBe(true);
  });

  it("does not turn a sentence with a digit in it into a number search", () => {
    const q = render("cut 2 nails")!;
    expect(q.sql).not.toContain("REPLACE");
  });

  /** A term containing a wildcard must not match far more than it says. */
  it("escapes LIKE wildcards in the term", () => {
    const q = render("100%")!;
    expect(q.params.some((p) => String(p).includes("100\\%"))).toBe(true);
  });

  it("emits no ESCAPE clause", () => {
    // Backslash is already the default LIKE escape in MySQL and TiDB.
    // Spelling it out inside a template literal is what broke the
    // sibling filter: one backslash escaped the closing quote.
    expect(render("Harvey")!.sql).not.toMatch(/ESCAPE/i);
  });
});

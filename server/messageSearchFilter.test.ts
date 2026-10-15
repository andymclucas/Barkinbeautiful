import { describe, it, expect } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { messageSearchFilter } from "./messageSearchFilter";
import { parseMessageSearch } from "@shared/messageSearch";

/**
 * Renders the filter as the database would receive it.
 *
 * The tests below exist because the term parsing was fully covered and
 * every search still failed: the bug was in the SQL built FROM the term,
 * which nothing looked at. `ESCAPE '\\'` inside a template literal is one
 * backslash at runtime, that backslash escaped the closing quote, and the
 * statement could not be parsed at all.
 */
const dialect = new MySqlDialect();
const render = (term: string) => {
  const filter = messageSearchFilter(parseMessageSearch(term));
  if (!filter) return null;
  // The dialect renders a fragment on its own — no pool, no connection,
  // and exactly the text the database would be handed.
  return dialect.sqlToQuery(filter);
};

describe("messageSearchFilter", () => {
  it("adds no filter at all when there is nothing to search for", () => {
    // Not a filter that matches everything — none.
    expect(messageSearchFilter(parseMessageSearch(""))).toBeNull();
    expect(messageSearchFilter(parseMessageSearch("a"))).toBeNull();
  });

  it("produces SQL whose quotes are balanced", () => {
    // The exact shape of the bug: a lone backslash before the closing
    // quote swallowed it, leaving an unterminated string literal.
    for (const term of ["Harvey", "0427 030 788", "100%", "a_b", "back\\slash", "O'Brien"]) {
      const { sql: text } = render(term)!;
      const quotes = (text.match(/'/g) ?? []).length;
      expect(quotes % 2, `${term} -> ${text}`).toBe(0);
    }
  });

  it("never emits a backslash immediately before a closing quote", () => {
    for (const term of ["Harvey", "100%", "back\\slash"]) {
      expect(render(term)!.sql).not.toMatch(/\\'/);
    }
  });

  it("carries no ESCAPE clause, because backslash is already the default", () => {
    expect(render("Harvey")!.sql).not.toMatch(/ESCAPE/i);
  });

  it("searches message text, both names, the full name and the dog", () => {
    const { sql: text, params } = render("Harvey")!;
    expect(text).toContain("`sms_logs`.`body` LIKE");
    expect(text).toContain("`clients`.`first_name` LIKE");
    expect(text).toContain("`clients`.`last_name` LIKE");
    expect(text).toContain("CONCAT(`clients`.`first_name`");
    expect(text).toContain("EXISTS (SELECT 1 FROM pets p");
    // One pattern per place it is compared, all the same term.
    expect(params.filter((p) => p === "%Harvey%")).toHaveLength(5);
  });

  it("adds the number comparisons only for a phone-shaped term", () => {
    const named = render("Harvey")!;
    expect(named.sql).not.toContain("REPLACE");

    const dialled = render("0427 030 788")!;
    expect(dialled.sql).toContain("REPLACE");
    // Punctuation stripped from the stored value too, since it is held
    // as +61427030788 and typed as 0427 030 788.
    expect(dialled.params).toContain("%427030788%");
  });

  it("escapes a wildcard so the term means itself", () => {
    expect(render("100%")!.params).toContain("%100\\%%");
  });
});

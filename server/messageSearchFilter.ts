/**
 * The SQL half of conversation search.
 *
 * Extracted from the router so it can be rendered and inspected in a
 * test. It had an `ESCAPE '\\'` clause which, inside a template literal,
 * is a single backslash at runtime — that escapes the closing quote and
 * makes the whole statement unparseable. Every search failed, and the
 * unit tests could not see it because they only covered the term
 * parsing, not the SQL built from it.
 *
 * There is no ESCAPE clause now: backslash is already the default LIKE
 * escape in MySQL and TiDB, which is exactly what likePattern emits.
 */
import { sql, type SQL } from "drizzle-orm";
import { clients, smsLogs } from "../drizzle/schema";
import { likePattern, type MessageSearch } from "@shared/messageSearch";

/**
 * What a term has to match for a conversation to count: anything said in
 * a message, the client's first or last name, the two joined, a dog's
 * name, or — when the term is phone-shaped — the number on either the
 * message or the client record.
 *
 * Null when there is nothing to search for, so the caller adds no filter
 * at all rather than one that matches everything.
 */
export function messageSearchFilter(search: MessageSearch): SQL | null {
  if (!search.active) return null;
  const like = likePattern(search.text);
  const digits = search.phoneDigits;

  // Punctuation is stripped from BOTH sides before comparing: a number
  // is stored as +61427030788 and typed as 0427 030 788, and neither
  // form contains the other.
  const phone = digits
    ? sql`OR REPLACE(REPLACE(REPLACE(${smsLogs.toNumber}, ' ', ''), '-', ''), '+', '') LIKE ${`%${digits}%`}
          OR REPLACE(REPLACE(REPLACE(${clients.phone}, ' ', ''), '-', ''), '+', '') LIKE ${`%${digits}%`}`
    : sql``;

  return sql`(
    ${smsLogs.body} LIKE ${like}
    OR ${clients.firstName} LIKE ${like}
    OR ${clients.lastName} LIKE ${like}
    OR CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${like}
    OR EXISTS (SELECT 1 FROM pets p WHERE p.client_id = ${clients.id} AND p.name LIKE ${like})
    ${phone}
  )`;
}

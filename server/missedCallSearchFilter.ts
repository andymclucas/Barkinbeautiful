/**
 * The SQL half of voicemail search.
 *
 * Deliberately a sibling of messageSearchFilter rather than a copy with
 * the table names swapped: the TERM parsing is shared with conversation
 * search (`parseMessageSearch`), so "0427", "Harvey" and "needs his
 * bandana off" mean the same thing in both boxes. Only the columns a
 * term can match differ, because a voicemail has a transcript and a
 * caller name where a thread has a message body.
 *
 * Like its sibling it emits no `ESCAPE` clause. Backslash is already
 * the default LIKE escape in MySQL and TiDB, and spelling it out inside
 * a template literal is what broke conversation search once already.
 */
import { sql, type SQL } from "drizzle-orm";
import { clients, missedCalls } from "../drizzle/schema";
import { likePattern, type MessageSearch } from "@shared/messageSearch";

/**
 * What a term has to match for a voicemail to count: anything said in
 * the transcript, the name the caller gave, the linked client's name,
 * one of their dogs, or — when the term is phone-shaped — the number it
 * came from.
 *
 * The transcript is the important one. Staff look for "Christina said
 * something about surgery" weeks later, and the only record of that is
 * the transcript text.
 *
 * Null when there is nothing to search for, so the caller adds no
 * filter rather than one matching everything.
 */
export function missedCallSearchFilter(search: MessageSearch): SQL | null {
  if (!search.active) return null;
  const like = likePattern(search.text);
  const digits = search.phoneDigits;

  // Punctuation stripped from BOTH sides: a number arrives from Twilio
  // as +61427030788 and is typed as 0427 030 788, and neither form
  // contains the other.
  const phone = digits
    ? sql`OR REPLACE(REPLACE(REPLACE(${missedCalls.fromNumber}, ' ', ''), '-', ''), '+', '') LIKE ${`%${digits}%`}
          OR REPLACE(REPLACE(REPLACE(${clients.phone}, ' ', ''), '-', ''), '+', '') LIKE ${`%${digits}%`}`
    : sql``;

  return sql`(
    ${missedCalls.transcriptText} LIKE ${like}
    OR ${missedCalls.callerName} LIKE ${like}
    OR ${clients.firstName} LIKE ${like}
    OR ${clients.lastName} LIKE ${like}
    OR CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${like}
    OR EXISTS (SELECT 1 FROM pets p WHERE p.client_id = ${clients.id} AND p.name LIKE ${like})
    ${phone}
  )`;
}

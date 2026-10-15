/**
 * Finding a conversation in Messages.
 *
 * The list shows the 50 most recent threads. The salon has 117, and the
 * other 67 were simply not there — no "load more", no count, nothing to
 * say the list had been cut. A staff member looking for a client who last
 * texted in August concluded the conversation did not exist.
 *
 * So the box searches the database rather than filtering what is on
 * screen. The useful part is working out WHAT somebody typed: "0427",
 * "Harvey" and "cut under his bandana" are three different questions and
 * only one of them is a phone number.
 */

import { phoneMatchKey } from "./moegoImport";

export type MessageSearch = {
  /** The raw term, trimmed. Empty when there is nothing to search for. */
  text: string;
  /**
   * The last 9 digits, when the term is phone-shaped. Australian numbers
   * are written every way imaginable — 0427 030 788, +61427030788,
   * 427030788 — and the last nine digits are the only part all of them
   * share. Null when the term is plainly not a number.
   */
  phoneDigits: string | null;
  /** False for an empty or whitespace-only box: search nothing, show all. */
  active: boolean;
};

/**
 * A term shorter than this is not worth running. Two characters matches
 * most of the client list and reads as a broken search rather than a
 * narrow one.
 */
export const MIN_MESSAGE_SEARCH_LENGTH = 2;

export function parseMessageSearch(raw: string | null | undefined): MessageSearch {
  const text = String(raw ?? "").trim();
  if (text.length < MIN_MESSAGE_SEARCH_LENGTH) {
    return { text: "", phoneDigits: null, active: false };
  }

  // Phone-shaped means mostly digits: "0427 030 788" and "+61 427 030 788"
  // qualify, "Harvey" does not, and neither does "cut 2 nails" — a stray
  // digit in a sentence must not turn a text search into a number one.
  const digitsOnly = text.replace(/\D/g, "");
  const looksLikeNumber = digitsOnly.length >= 4 && /^[+\d\s()-]+$/.test(text);

  return {
    text,
    // A partial number still searches: somebody types the first four
    // digits off a missed call, so the key is whatever digits there are
    // rather than a strict nine.
    phoneDigits: looksLikeNumber ? (phoneMatchKey(text) || digitsOnly) : null,
    active: true,
  };
}

/**
 * The LIKE pattern for a term, with the wildcards SQL uses escaped.
 *
 * A client searching for "100%" or a note containing "_" would otherwise
 * match far more than they meant — `%` and `_` are wildcards inside a
 * LIKE, and a backslash escapes them.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

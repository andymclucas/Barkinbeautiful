/**
 * What a staff search box should match on a client/pet row.
 *
 * Staff type what they'd say out loud — "Andy McLucas" — but first and last
 * names live in separate columns, so a plain `firstName LIKE %term%` never
 * matched a full name and the Memberships page returned "No memberships in
 * this category" for a client who plainly had one. That reads as missing
 * data, not as a search miss.
 *
 * The rule: every whitespace-separated word in the search must appear
 * somewhere in the row's searchable text. "Andy McLucas", "mclucas andy"
 * and "and luc" all match; "Andy Smith" does not.
 *
 * The SQL in memberships.list mirrors this by also matching against
 * CONCAT(first_name, ' ', last_name). Keep the two in step.
 */

export type SearchableClientRow = {
  firstName?: string | null;
  lastName?: string | null;
  petName?: string | null;
};

/** The words a search box input should be broken into. Empty when blank. */
export function searchTerms(input: string | null | undefined): string[] {
  return (input ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesClientSearch(
  input: string | null | undefined,
  row: SearchableClientRow,
): boolean {
  const terms = searchTerms(input);
  if (terms.length === 0) return true; // a blank search filters nothing out

  const haystack = [row.firstName, row.lastName, row.petName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

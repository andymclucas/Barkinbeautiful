/**
 * When a grooming note is worth saving.
 *
 * Lauren via Andy, 04/11/2026, asked for the dog's grooming notes on
 * the workflow card so a groomer can write one with the dog in front of
 * them. The rule for whether Save does anything is small but it is a
 * rule, and `groomNotes.create` INSERTS — there is no update — so a
 * Save that should have been a no-op does not fail quietly, it adds a
 * duplicate entry to the dog's permanent styling history.
 *
 * Hence: blank is nothing to save, and re-saving the note that is
 * already the newest one on this booking is nothing to save either.
 * Whitespace is not a change, because "note " and "note" would
 * otherwise read as an edit and append a second identical row.
 */
export function groomNoteSaveable(input: {
  /** What is in the box. */
  draft: string | null | undefined;
  /** The newest note already recorded against this booking. */
  existing: string | null | undefined;
}): boolean {
  const draft = (input.draft ?? "").trim();
  if (draft.length === 0) return false;
  return draft !== (input.existing ?? "").trim();
}

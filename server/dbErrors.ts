/**
 * Recognising "that row is already there" from the MySQL driver.
 *
 * Used where a unique index is the real guard against a race and the losing
 * writer should carry on quietly rather than fail the request. mysql2 surfaces
 * this as code ER_DUP_ENTRY / errno 1062; the shape is checked loosely because
 * the error arrives through Drizzle and may be wrapped.
 */
export function isDuplicateEntryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const seen = new Set<unknown>();
  let current: unknown = error;
  // Drizzle wraps driver errors, so follow `cause` rather than only looking
  // at the top level.
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
    current = e.cause;
  }
  return false;
}

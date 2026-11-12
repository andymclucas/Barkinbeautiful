/**
 * The other dogs on the same booking as a row in a per-dog list.
 *
 * Andy, 13/11/2026, on a client with two dogs booked together every six
 * weeks: the dates were "all over the shop", "it was duplicating dates
 * and then deleting one of them caused the other to be deleted also."
 *
 * The client's Bookings tab lists one row PER DOG, so a two-dog booking
 * is two rows with the same date and nothing saying they belong together.
 * Its two controls then disagreed about what a row was:
 *
 * - the pencil moved ONLY the dog on that row, which left one dog on the
 *   Wednesday and its sibling on the Thursday, still tied by `sessionId`;
 * - the bin deleted EVERY dog on the booking, so removing what looked
 *   like a duplicate row took the other dog with it.
 *
 * Both now mean "this dog", and say so. The row names its companions,
 * the pencil offers to move them together (on by default, because a
 * family that arrives together moves together), and the bin deletes the
 * one dog.
 */

export type BookingRow = {
  id: number;
  sessionId?: string | null;
  petName?: string | null;
  status?: string | null;
  workflowState?: string | null;
};

const NOT_COMING = new Set(["cancelled", "no_show"]);

/** Other dogs on the same booking that are still coming. */
export function companionsOf<T extends BookingRow>(row: BookingRow, all: readonly T[]): T[] {
  if (!row.sessionId) return [];
  return all.filter((other) =>
    other.id !== row.id
    && other.sessionId === row.sessionId
    && !NOT_COMING.has(String(other.workflowState ?? ""))
    && !NOT_COMING.has(String(other.status ?? "")));
}

/** "Misha" / "Misha and Bear" / "Misha, Bear and Tilly". */
export function joinNames(names: readonly (string | null | undefined)[]): string {
  const list = names.map((n) => (n ?? "").trim() || "another dog");
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

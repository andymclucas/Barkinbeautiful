/**
 * The order of the Messages conversation list.
 *
 * Lauren, 24/11/2026: "also showing 3 unread messages but for life i cant
 * find them". The badge counted three unread texts from Sunday, and the
 * list, newest conversation first and 50 to a page, had 71 conversations
 * with something newer in them. The three sat on page two, nothing on
 * page one was marked unread, and the badge looked wrong when it was not.
 *
 * So a conversation with anything unread in it comes first, newest of
 * those first, and everything else follows newest first as before. A
 * conversation drops back into time order the moment it is read.
 */
export type OrderableThread = { unreadCount: number; lastAt: Date | string | number };

export function orderMessageThreads<T extends OrderableThread>(threads: readonly T[]): T[] {
  const time = (t: T) => new Date(t.lastAt).getTime();
  return [...threads].sort((a, b) =>
    Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || time(b) - time(a));
}

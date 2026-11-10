/**
 * Archiving a dog: taking it off every booking list without saying it died.
 *
 * Andy to Lauren, 10/11/2026: "Let's make an 'archive dog' button."
 *
 * `pets.status` used to be active|departed, so a dog that had simply
 * stopped coming — or a duplicate record left behind when two files were
 * split — could only be retired by recording it as PASSED AWAY. Five of
 * seven "departed" dogs on 19/10/2026 were duplicates wearing memorial
 * wings. Lena (Pobje), Frankie (Harris) and a second Nova left on Paris
 * Manteit's file after the sisters' records were separated are the cases
 * that prompted this.
 *
 * Archived means: hidden from booking, the clients list, the client
 * portal and the Pet Tracker; history kept; restorable from the client
 * page. Departed still means passed away, and still shows the memorial.
 *
 * Archiving is refused while the dog has anything live, rather than
 * quietly cancelling it. Cancelling a booking can text a client and
 * ending a membership moves money; an archive button must do neither.
 */

export type PetStatus = "active" | "departed" | "archived";

/** Still a current dog — bookable, listed, offered as a replacement. */
export function isPetCurrent(status: string | null | undefined): boolean {
  return status !== "departed" && status !== "archived";
}

export function isPetArchived(status: string | null | undefined): boolean {
  return status === "archived";
}

export type ArchiveCheck = {
  name: string;
  status: string | null | undefined;
  /** Live bookings from now on, not cancelled or no-show. */
  upcomingBookings: number;
  /** Names of active memberships this dog holds or is covered by. */
  memberships: readonly string[];
};

/** Why this dog cannot be archived yet, or null when it can. */
export function archiveBlocker(check: ArchiveCheck): string | null {
  const name = check.name?.trim() || "This dog";
  if (check.status === "archived") return `${name} is already archived.`;
  if (check.status === "departed") {
    return `${name} is recorded as passed away, which already takes them off the booking lists.`;
  }
  if (check.upcomingBookings > 0) {
    const n = check.upcomingBookings;
    return `${name} has ${n} upcoming booking${n === 1 ? "" : "s"}. Cancel or move ${n === 1 ? "it" : "them"} first.`;
  }
  if (check.memberships.length > 0) {
    const plans = check.memberships.join(", ");
    return `${name} is on a membership (${plans}). Move or end it first, so nothing is still billed for a dog nobody can book.`;
  }
  return null;
}

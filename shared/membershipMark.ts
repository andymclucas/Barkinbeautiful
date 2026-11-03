/**
 * Which bookings wear the VIP mark on the calendar.
 *
 * Lauren, 03/11/2026: "after you invoice the dogs the colour changes
 * ... well membership dogs you can't complete the invoice if it's $0.
 * It doesn't change colour. Will they have an easy way to tell if they
 * are on a membership from the appointment view."
 *
 * She is right, and the reason is mechanical. `paymentStatus` is
 * DERIVED by refreshPaymentStatus, which only runs when somebody
 * records a payment. A membership groom is $0, so nobody ever opens
 * the payment panel, so it is never derived and the column stays null
 * for ever. The dog sits in the "not settled" pile permanently and the
 * only way to find out otherwise is to open it.
 *
 * Andy, 04/11/2026: "Replace the 'Member' text with a circular VIP
 * icon for all membership clients and make it gold."
 *
 * Deliberately independent of payment. This is a fact about the DOG —
 * it is on a plan — not about whether money has arrived, and a small
 * round mark can sit beside the PAID stamp rather than replacing it.
 * A membership client who paid for extras done on the day therefore
 * reads as both: paid, and a member. An earlier version made the two
 * mutually exclusive and had to hide one of them.
 */

/**
 * The booking's OWN membership link, never the client's.
 *
 * 128 of 713 upcoming bookings belong to a client who holds an active
 * membership that this particular booking is NOT linked to. Those WILL
 * be charged, so marking them VIP would be a lie that costs money at
 * the counter. The link on the appointment row is the only thing that
 * means "this groom is covered".
 */
export function showsMembershipMark(appointment: {
  membershipId?: number | null;
  isCancelled?: boolean;
}): boolean {
  /* A dog that did not come is nobody's problem, and the cancelled
     treatment already owns the whole card. */
  if (appointment.isCancelled) return false;
  return appointment.membershipId !== null && appointment.membershipId !== undefined;
}

/**
 * Gold, and legible on a pale card.
 *
 * A flat metallic gold is about 2:1 against white, which is a
 * decorative colour rather than a readable one — so the mark is a
 * FILLED gold disc with near-black lettering on it, not gold text.
 * The border is a deeper gold so the disc still has an edge where the
 * card behind it is itself warm-toned.
 */
export const VIP_GOLD = {
  /** The disc. */
  fill: "#e3b23c",
  /** Its edge, and the ring shadow. */
  edge: "#a87b12",
  /** The letters. */
  ink: "#3d2c00",
} as const;

/**
 * Who to ring about a booking.
 *
 * `clients` carries one phone, so a client whose daughter does the pickup had
 * nowhere to record her. The salon solved it on the whiteboard — "Tx +
 * Rochelle" in green marker — which means the fact dies when the board is
 * wiped and is invisible to whoever was not on shift.
 *
 * `client_contacts` already held the extra numbers and the pickup dialog
 * already let staff pick one AT SEND TIME. What was missing is choosing it in
 * advance, on the appointment, so the board can show it before anybody
 * reaches for the phone. `appointments.contactId` is that choice, and null
 * means the client themselves — the default, and the truth for every booking
 * made before this existed.
 *
 * The option list lives here because two call sites build it: the pickup
 * message preview and the appointment card. They drifting apart is how a
 * groomer ends up texting a different person from the one on the board.
 */

export type ClientLike = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};

export type AdditionalContact = {
  id: number;
  name: string;
  phone: string | null;
  relationship?: string | null;
};

export type ContactOption = {
  /** null is the client themselves. */
  id: number | null;
  name: string;
  phone: string | null;
  relationship: string;
  isPrimary: boolean;
};

export const PRIMARY_CONTACT_LABEL = "Primary contact";

export function clientDisplayName(client: ClientLike): string {
  return `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();
}

/**
 * Everything the picker may offer, the client first.
 *
 * A contact with no phone is still listed: the salon may hold a name and an
 * email, and hiding it would make the record look empty. Whether a message
 * can actually be sent is a separate question — see `canTextContact`.
 */
export function contactOptions(
  client: ClientLike,
  additional: ReadonlyArray<AdditionalContact>,
): ContactOption[] {
  const primaryName = clientDisplayName(client);
  const options: ContactOption[] = [];
  if (primaryName || client.phone) {
    options.push({
      id: null,
      name: primaryName || "Client",
      phone: client.phone ?? null,
      relationship: PRIMARY_CONTACT_LABEL,
      isPrimary: true,
    });
  }
  for (const contact of additional) {
    options.push({
      id: contact.id,
      name: contact.name,
      phone: contact.phone ?? null,
      relationship: contact.relationship?.trim() || "Additional contact",
      isPrimary: false,
    });
  }
  return options;
}

/**
 * The option an appointment points at.
 *
 * Falls back to the primary when the stored contact has since been removed
 * from the client's record, rather than returning nothing: a booking whose
 * contact was deleted must still be ringable, and silently showing no
 * contact at all is how a dog waits at the salon.
 */
export function resolveAppointmentContact(
  options: ReadonlyArray<ContactOption>,
  contactId: number | null | undefined,
): ContactOption | null {
  if (options.length === 0) return null;
  if (contactId === null || contactId === undefined) {
    return options.find((option) => option.isPrimary) ?? options[0];
  }
  return (
    options.find((option) => option.id === contactId)
    ?? options.find((option) => option.isPrimary)
    ?? options[0]
  );
}

/** Whether the stored choice no longer matches any contact on file. */
export function contactChoiceIsStale(
  options: ReadonlyArray<ContactOption>,
  contactId: number | null | undefined,
): boolean {
  if (contactId === null || contactId === undefined) return false;
  return !options.some((option) => option.id === contactId);
}

export function canTextContact(option: ContactOption | null | undefined): boolean {
  return Boolean(option?.phone && option.phone.trim());
}

/**
 * What the workflow board shows. The relationship is the useful half —
 * "Rochelle" alone means nothing to a groomer who has not met her.
 */
export function contactBadgeLabel(option: ContactOption | null | undefined): string | null {
  if (!option || option.isPrimary) return null;
  return option.relationship && option.relationship !== "Additional contact"
    ? `${option.name} (${option.relationship})`
    : option.name;
}

/**
 * The badge for a row that already carries the contact from a join, as the
 * calendar and workflow board queries both do.
 *
 * Same wording as `contactBadgeLabel` and deliberately routed through it:
 * the board and the appointment card showing different names for the same
 * booking is the exact confusion this feature exists to remove.
 *
 * Null when the booking is for the client themselves, which is the normal
 * case — otherwise every row on the board would repeat the owner's name
 * directly under the owner's name.
 */
export function joinedContactBadge(row: {
  contactId?: number | null;
  contactName?: string | null;
  contactRelationship?: string | null;
}): string | null {
  if (row.contactId === null || row.contactId === undefined) return null;
  // The id is set but the join found nothing: the contact was deleted from
  // the client's record. Say so rather than showing a blank badge.
  if (!row.contactName) return null;
  return contactBadgeLabel({
    id: row.contactId,
    name: row.contactName,
    phone: null,
    relationship: row.contactRelationship?.trim() || "Additional contact",
    isPrimary: false,
  });
}

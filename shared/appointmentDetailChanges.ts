/**
 * Which appointment detail fields a save should actually send.
 *
 * `appointments.updateDetails` clears the whole discount block the moment a
 * price arrives — deliberately, because a hand-typed price replaces whatever
 * the discount produced and leaving the old label would describe the new
 * figure as "10% off" when it is not.
 *
 * The consequence is that re-sending an UNCHANGED price is destructive. The
 * edit dialog used to send serviceType, notes and price together whenever any
 * one of them differed, so changing only the notes on a discounted booking
 * quietly removed the discount. Sending only what changed is what keeps that
 * from happening, and it matters more now that each dog in a family carries
 * its own service and price.
 *
 * A field absent from `next` is one the caller is not editing, and is never
 * compared or sent.
 */

export type AppointmentDetailChanges = {
  serviceType?: string;
  notes?: string | null;
  price?: string | null;
};

export type AppointmentDetailCurrent = {
  serviceType?: string | null;
  notes?: string | null;
  price?: string | null;
};

export type AppointmentDetailDraft = {
  serviceType?: string;
  notes?: string;
  price?: string;
};

export function appointmentDetailChanges(
  current: AppointmentDetailCurrent,
  next: AppointmentDetailDraft,
): AppointmentDetailChanges {
  const changes: AppointmentDetailChanges = {};
  if (next.serviceType !== undefined && next.serviceType !== (current.serviceType ?? "")) {
    changes.serviceType = next.serviceType;
  }
  if (next.notes !== undefined && next.notes !== (current.notes ?? "")) {
    // "" means the groomer cleared the field, which is null in the database.
    changes.notes = next.notes || null;
  }
  if (next.price !== undefined && next.price !== (current.price ?? "")) {
    changes.price = next.price || null;
  }
  return changes;
}

export function hasAppointmentDetailChanges(changes: AppointmentDetailChanges): boolean {
  return Object.keys(changes).length > 0;
}

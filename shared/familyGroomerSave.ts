/**
 * Which groomer each dog on a booking is saved with, when the booking
 * dialog's Save is pressed.
 *
 * Andy, 12/11/2026, with a screen recording of Trixie & Teddy: "It won't
 * save the groomer change — ensure that this saves whenever a groomer is
 * changed."
 *
 * A booking with more than one dog shows one Groomer dropdown per dog,
 * and the dog the dialog was opened on is the first of them. Its choice
 * went into the per-dog map like everyone else's, but the save read the
 * FIRST dog's groomer from the single-dog field — which on a family
 * booking is not on screen at all and never changes. So moving the first
 * dog to another groomer said "Appointment updated" and saved nothing,
 * while the same change on the second dog worked.
 *
 * The other dogs also used to be saved at the first dog's start and end,
 * which pulled a staggered family (one dog at 9:30, its sibling at 10:00)
 * onto one time whenever a groomer changed. They now keep their own
 * times, moved by however far the first dog moved.
 *
 * Lauren, 18/11/2026: "you go to move a double booking but it just moves
 * one dog. needs to automate moving the whole linked booking." That fix
 * left a gap: a dog whose groomer dropdown was not touched was sent
 * nothing at all, so when the first dog's day or time changed the others
 * stayed where they were. The first dog's call now carries
 * `withBooking`, which has the server move every other dog still on the
 * same booking at the same time, each keeping its own groomer and length
 * (calendar.reschedule). `moveWholeBooking: false` is the way to move one
 * dog on its own, for a family that is deliberately staggered.
 */
import { brisbaneLocalInputValue, parseBrisbaneLocalDateTime } from "./localDateTime";

export type FamilyDog = {
  id: number;
  staffId: number | null;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
};

export type RescheduleCall = {
  appointmentId: number;
  scheduledStart: string;
  scheduledEnd: string;
  staffId: number | null;
  /** Take the other dogs on the booking along. Only ever set on the first dog's call. */
  withBooking?: boolean;
};

/** "" means Unassigned; anything else is a staff id. */
const asStaffId = (value: string | null | undefined): number | null => {
  if (!value || value === "__unassigned__") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

export function familyRescheduleCalls(input: {
  primary: FamilyDog;
  siblings: FamilyDog[];
  /** The per-dog dropdowns, by appointment id; absent means untouched. */
  pickedGroomers: Record<number, string | undefined>;
  /** The single-dog Groomer field and the dialog's start and end. */
  form: { staffId: string; scheduledStart: string; scheduledEnd: string };
  /** False moves the first dog alone. Absent means the whole booking moves. */
  moveWholeBooking?: boolean;
}): RescheduleCall[] {
  const { primary, siblings, pickedGroomers, form } = input;

  // On a family booking the first dog's dropdown is the one on screen.
  const primaryPick = siblings.length > 0 ? pickedGroomers[primary.id] : undefined;
  const calls: RescheduleCall[] = [{
    appointmentId: primary.id,
    scheduledStart: form.scheduledStart,
    scheduledEnd: form.scheduledEnd,
    staffId: asStaffId(primaryPick !== undefined ? primaryPick : form.staffId),
  }];

  const movedBy = parseBrisbaneLocalDateTime(form.scheduledStart).getTime()
    - new Date(primary.scheduledStart).getTime();
  const shifted = (value: Date | string) =>
    brisbaneLocalInputValue(new Date(new Date(value).getTime() + (Number.isFinite(movedBy) ? movedBy : 0)));

  // The start moved and there are other dogs on the booking: they go too,
  // unless staff said this dog moves alone.
  const started = Number.isFinite(movedBy) && movedBy !== 0;
  if (started && siblings.length > 0 && input.moveWholeBooking !== false) {
    calls[0].withBooking = true;
  }

  // A dog whose groomer was changed gets its own call. It moves with the
  // first dog — unless staff said the first dog moves alone, in which case
  // it keeps its own time and only its groomer changes. Without this the
  // tick-box said "Teddy will stay" and Teddy moved anyway.
  const staysPut = input.moveWholeBooking === false;
  const own = (value: Date | string) => brisbaneLocalInputValue(new Date(value));
  for (const sibling of siblings) {
    const pick = pickedGroomers[sibling.id];
    if (pick === undefined) continue;
    calls.push({
      appointmentId: sibling.id,
      scheduledStart: staysPut ? own(sibling.scheduledStart) : shifted(sibling.scheduledStart),
      scheduledEnd: staysPut ? own(sibling.scheduledEnd) : shifted(sibling.scheduledEnd),
      staffId: asStaffId(pick),
    });
  }
  return calls;
}

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

  for (const sibling of siblings) {
    const pick = pickedGroomers[sibling.id];
    if (pick === undefined) continue;
    calls.push({
      appointmentId: sibling.id,
      scheduledStart: shifted(sibling.scheduledStart),
      scheduledEnd: shifted(sibling.scheduledEnd),
      staffId: asStaffId(pick),
    });
  }
  return calls;
}

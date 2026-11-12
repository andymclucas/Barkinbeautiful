/**
 * Taking ONE dog off a family booking, and putting it back.
 *
 * Lauren, 04/11/2026, on a three-dog booking: "how do I delete 1 dog
 * from this booking. Teddy isn't coming this time."
 *
 * The answer was that she could not. Groomigo stores one appointment
 * row per dog and ties them together with `sessionId`, but the calendar
 * draws only ONE card per session — the lowest id — so the other dogs
 * have nothing to click. The dialog that card opens has per-dog rows
 * for groomer, service, price and add-ons, and a Status dropdown that
 * applies to the primary dog ALONE. For any other dog in the booking
 * there was no control at all.
 *
 * The one button that looked like it would do it does the opposite:
 * `deleteAppointment` resolves a session to every row in it, and its
 * own confirm dialog says so — "Any pets in this shared booking will be
 * deleted together." Pressing it to drop Teddy would have taken Stella
 * and Belle with him.
 *
 * ## Cancel, not delete
 *
 * "Isn't coming this time" is a cancellation, so this marks the dog
 * cancelled rather than removing the row. That keeps the `workflowLogs`
 * audit trail, leaves the client's history honest, and costs nothing on
 * the board: `liveSiblings` already drops a cancelled dog from the
 * session, so the card goes from "3 DOGS" to "2 DOGS" on its own and
 * the cancelled dog is drawn on its own.
 *
 * The remaining dogs keep their times. A booking does not compress
 * because one dog dropped out — the groomer's morning is still laid out
 * the way it was, and shortening it is a judgement someone makes by
 * dragging the block.
 */

/** Only what the decision reads. */
export type AttendanceDog = {
  id: number;
  petName?: string | null;
  status?: string | null;
  workflowState?: string | null;
};

export type AttendanceDecision =
  /**
   * Still coming, and may be marked as not coming.
   *
   * `checkedIn` is set when the dog has been checked in but nothing
   * further — see CHECKED_IN_ONLY below.
   */
  | { action: "remove"; label: string; checkedIn?: true }
  /** Already not coming, and may be put back on. */
  | { action: "restore"; label: string }
  /**
   * Neither. The dog is at the salon or its groom has happened, and
   * Trap 4 of the MoeGo sync is the same rule from the other side:
   * only ever act on a row still at `scheduled`.
   */
  | { action: "blocked"; label: string; reason: string };

const NOT_COMING = new Set(["cancelled", "no_show"]);

/**
 * Checked in and nothing more. Still removable, one dog at a time.
 *
 * Andy, 13/11/2026, on a three-dog booking: "Chloe isn't coming, but
 * the other dogs are in." The family had been checked in together, so
 * Chloe read "At the salon" and the Not coming button was gone — for
 * the one dog that was not there.
 *
 * Check-in is the step most often applied to the whole family at the
 * door, so it is the one state where "at the salon" can simply be
 * wrong. Once a dog is in the bath somebody has had hands on it, and
 * those states stay blocked.
 *
 * The whole-booking cancel still leaves a checked-in dog alone: one
 * press there would take every dog off the floor on the strength of a
 * mistake about one of them.
 */
const CHECKED_IN_ONLY = "checked_in";

/** In the bath or beyond — on the floor, untouchable from here. */
const IN_SALON = new Set([
  "waiting_for_bath", "bathing",
  "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready",
]);

function statesOf(dog: AttendanceDog): string[] {
  return [String(dog.workflowState ?? "").trim(), String(dog.status ?? "").trim()];
}

export function attendanceDecision(dog: AttendanceDog): AttendanceDecision {
  const states = statesOf(dog);
  const name = (dog.petName ?? "").trim() || "This dog";

  /*
   * Checked FIRST, because a cancelled row can also carry a stale
   * workflow state from before it was cancelled and the two columns
   * disagree constantly — a booking cancelled through the board may set
   * only the workflow state, one cancelled through the MoeGo sync sets
   * both. "Not coming" wins over whatever stage it was at.
   */
  if (states.some((s) => NOT_COMING.has(s))) {
    return { action: "restore", label: "Put back on" };
  }
  if (states.includes("complete")) {
    return { action: "blocked", label: "Groomed", reason: `${name} has already been groomed.` };
  }
  if (states.some((s) => IN_SALON.has(s))) {
    return { action: "blocked", label: "At the salon", reason: `${name} is already at the salon.` };
  }
  if (states.includes(CHECKED_IN_ONLY)) {
    return { action: "remove", label: "Not coming", checkedIn: true };
  }
  return { action: "remove", label: "Not coming" };
}

export type AttendanceRow = AttendanceDecision & {
  id: number;
  name: string;
  /** False once the dog is cancelled or a no-show. */
  coming: boolean;
};

/** One row per dog on the booking, in the order given. */
export function bookingAttendance(dogs: readonly AttendanceDog[]): AttendanceRow[] {
  return dogs.map((dog) => {
    const decision = attendanceDecision(dog);
    return {
      ...decision,
      id: dog.id,
      name: (dog.petName ?? "").trim() || `Dog ${dog.id}`,
      coming: decision.action !== "restore",
    };
  });
}

/**
 * The sentence shown before marking a dog as not coming.
 *
 * Says what happens to the REST of the booking, because that is the
 * thing the button has been getting wrong: staff have every reason to
 * expect a control in a shared booking to touch the whole thing.
 */
export function describeRemoval(name: string, remainingNames: readonly string[], checkedIn = false): string {
  return (checkedIn ? `${name} is checked in. Only do this if ${name} did not arrive. ` : "")
    + describePlainRemoval(name, remainingNames);
}

function describePlainRemoval(name: string, remainingNames: readonly string[]): string {
  if (remainingNames.length === 0) {
    return `${name} will be marked as not coming. That leaves no dogs on this booking — it will show as cancelled.`;
  }
  const rest = remainingNames.length === 1
    ? remainingNames[0]
    : `${remainingNames.slice(0, -1).join(", ")} and ${remainingNames[remainingNames.length - 1]}`;
  return `${name} will be marked as not coming. ${rest} ${remainingNames.length === 1 ? "stays" : "stay"} booked at the same time.`;
}

/**
 * The line under "Dogs on this booking".
 *
 * It used to read "{coming} of {total} coming" unconditionally, which
 * on a booking whose dogs had all been groomed that morning said "2 of
 * 2 coming" about two dogs that had been and gone. Seen on the live
 * site on 04/11/2026, on Eddy and Albert Hartney.
 *
 * So it says what is actually true, and the hint about marking a dog
 * off only appears when there is a dog that can still be marked off.
 */
export function describeAttendance(rows: readonly AttendanceRow[]): string {
  const total = rows.length;
  if (total === 0) return "";
  const notComing = rows.filter((r) => r.action === "restore").length;
  const canRemove = rows.filter((r) => r.action === "remove").length;
  const done = rows.filter((r) => r.action === "blocked").length;
  const dogs = (n: number) => `${n} ${n === 1 ? "dog" : "dogs"}`;

  const hint = canRemove > 0
    ? " Marking one as not coming leaves the others at the same time."
    : "";

  if (notComing === total) return "None of these dogs are coming.";
  if (done === total) return total === 1 ? "This dog has been groomed." : `All ${dogs(total)} have been groomed.`;
  if (notComing === 0) {
    const head = done > 0
      ? `${dogs(canRemove)} still to come, ${done} already groomed.`
      : `All ${dogs(total)} coming.`;
    return head + hint;
  }
  return `${dogs(notComing)} not coming, ${total - notComing} still booked.` + hint;
}

/**
 * Taking the WHOLE booking off in one action.
 *
 * Andy, 04/11/2026: "Build the cancel whole booking action."
 *
 * Cancelling a family dog by dog sends one text per dog, because each
 * press is a separate decision arriving minutes apart and there is no
 * scheduler to batch them. That breaks the rule Andy states most
 * plainly — "Do not ever send 2 or 3" — and the per-dog control is the
 * only way the dialog offered to do it.
 *
 * One action cancelling every dog at once fixes it at the source: the
 * rows are already cancelled by the time the notice runs, so
 * sendCancellationNotice finds them all untold and sends ONE text
 * naming all of them.
 *
 * It reuses attendanceDecision rather than deciding again, so a dog at
 * the salon or already groomed is refused here for exactly the reason
 * it is refused one at a time, and the two can never disagree.
 */
export type WholeBookingCancellation = {
  /** Still to come, and will be cancelled. */
  cancel: AttendanceRow[];
  /** At the salon or already groomed. Left alone, and named. */
  blocked: AttendanceRow[];
  /** Already off. Nothing to do and nothing to say about them. */
  alreadyOff: AttendanceRow[];
};

export function wholeBookingCancellation(
  dogs: readonly AttendanceDog[],
): WholeBookingCancellation {
  const rows = bookingAttendance(dogs);
  return {
    // A checked-in dog can be taken off one at a time, never in bulk.
    cancel: rows.filter((r) => r.action === "remove" && !r.checkedIn),
    blocked: rows.filter((r) => r.action === "blocked" || (r.action === "remove" && r.checkedIn)),
    alreadyOff: rows.filter((r) => r.action === "restore"),
  };
}

/** The sentence on the confirm, which has to name what will NOT happen. */
export function describeWholeBookingCancellation(plan: WholeBookingCancellation): string {
  const names = (rows: readonly AttendanceRow[]) => {
    const list = rows.map((r) => r.name);
    if (list.length <= 1) return list[0] ?? "";
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  };

  if (plan.cancel.length === 0) {
    return plan.blocked.length > 0
      ? `Nothing to cancel — ${names(plan.blocked)} ${plan.blocked.length === 1 ? "is" : "are"} already at the salon or groomed.`
      : "This booking is already cancelled.";
  }

  const head = plan.cancel.length === 1
    ? `${names(plan.cancel)} will be marked as not coming.`
    : `All ${plan.cancel.length} dogs — ${names(plan.cancel)} — will be marked as not coming.`;

  /*
   * Said out loud because it is the whole point of the action: one
   * text, not one per dog. Staff have been told the opposite by
   * experience.
   */
  const text = ` The client gets one text naming ${plan.cancel.length === 1 ? "them" : "all of them"}.`;

  const left = plan.blocked.length > 0
    ? ` ${names(plan.blocked)} ${plan.blocked.length === 1 ? "is" : "are"} left alone — already at the salon or groomed.`
    : "";

  return head + text + left;
}

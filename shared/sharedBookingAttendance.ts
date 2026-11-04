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
  /** Still coming, and may be marked as not coming. */
  | { action: "remove"; label: string }
  /** Already not coming, and may be put back on. */
  | { action: "restore"; label: string }
  /**
   * Neither. The dog is at the salon or its groom has happened, and
   * Trap 4 of the MoeGo sync is the same rule from the other side:
   * only ever act on a row still at `scheduled`.
   */
  | { action: "blocked"; label: string; reason: string };

const NOT_COMING = new Set(["cancelled", "no_show"]);

/** Arrived and not yet finished — on the floor, untouchable from here. */
const IN_SALON = new Set([
  "checked_in", "waiting_for_bath", "bathing",
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
export function describeRemoval(name: string, remainingNames: readonly string[]): string {
  if (remainingNames.length === 0) {
    return `${name} will be marked as not coming. That leaves no dogs on this booking — it will show as cancelled.`;
  }
  const rest = remainingNames.length === 1
    ? remainingNames[0]
    : `${remainingNames.slice(0, -1).join(", ")} and ${remainingNames[remainingNames.length - 1]}`;
  return `${name} will be marked as not coming. ${rest} ${remainingNames.length === 1 ? "stays" : "stay"} booked at the same time.`;
}

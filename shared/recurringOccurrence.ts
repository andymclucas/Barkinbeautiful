/**
 * Whether one occurrence of a recurring booking can go in.
 *
 * Lauren, 10/11/2026: "Tried to make my first reoccurring booking for
 * [a client] 6 weekly starting from the 27th Jan she wants 7:30am but I
 * can move time if needed... It won't let me book her in."
 *
 * Every date was refused — all four — with "the groomer is already
 * busy". Nobody was on leave. The groomer had another dog at 7:30, as
 * they do most mornings: on 27 Jan 2027 two groomers each had one.
 *
 * ## An overlapping dog is not a clash here, and was not anywhere else
 *
 * `createRecurringAppointments` was the last path still treating any
 * overlap as a conflict. `shared/groomerAvailability.ts` settled this
 * with numbers: 14,445 overlapping pairs against 12,728 appointments,
 * only 150 of them one family. One dog in the bath, one drying, one on
 * the table is what the 12-state workflow is FOR. A rule that refuses
 * on overlap refuses nearly every booking, which is exactly what Lauren
 * hit — and it refused silently in a loop, so she got four dates and no
 * way forward.
 *
 * So this uses the same rule as Next available, the rebook dialog and
 * the appointment panel: only LEAVE means the groomer is not there.
 *
 * ## What limits a groomer is their day, not the clock
 *
 * Capacity is real — Lauren's own numbers, 8 clips for Charlotte and
 * Megs down to 5 for Ashleigh — and it lives in
 * `shared/groomerCapacity.ts`. It is a WARNING everywhere else in the
 * app ("would be half a clip over a 6-dog day — you'll be asked to
 * confirm"), so it is reported here and does not refuse. A series
 * booked six months out would otherwise be decided by a diary that has
 * barely been filled in.
 */

export type OccurrenceBlockout = {
  staffId: number;
  staffName?: string | null;
  /** What the salon called the leave: "Annual leave", "Sydney". */
  reason?: string | null;
};

export type OccurrenceDogClash = {
  petId: number;
  petName?: string | null;
};

/**
 * Why this occurrence cannot be booked, or null when it can.
 *
 * Leave first: it is the one that is nobody's fault and cannot be
 * resolved by moving the dog an hour. A dog already booked that day is
 * second, because it is usually a mistake being caught.
 */
export function recurringOccurrenceRefusal(input: {
  blockouts: readonly OccurrenceBlockout[];
  dogsAlreadyBooked: readonly OccurrenceDogClash[];
  /** The message the shared duplicate rule produces, passed in so there is one wording. */
  duplicateMessage?: string | null;
}): string | null {
  if (input.blockouts.length > 0) {
    const who = Array.from(
      new Set(input.blockouts.map(b => b.staffName?.trim() || "The groomer"))
    );
    const why = Array.from(
      new Set(
        input.blockouts
          .map(b => b.reason?.trim())
          .filter((r): r is string => Boolean(r))
      )
    );
    const names =
      who.length === 1
        ? who[0]
        : `${who.slice(0, -1).join(", ")} and ${who[who.length - 1]}`;
    const isAre = who.length === 1 ? "is" : "are";
    return why.length > 0
      ? `${names} ${isAre} not working then — ${why.join(", ")}`
      : `${names} ${isAre} not working then`;
  }
  if (input.dogsAlreadyBooked.length > 0) {
    return input.duplicateMessage?.trim() || "Already booked that day";
  }
  return null;
}

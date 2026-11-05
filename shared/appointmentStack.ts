/**
 * Which appointments are hidden behind the one you tapped.
 *
 * Andy, 05/11/2026, with a photo of the phone board: "Need to find a way
 * to be able to see the appts behind the ones over the top. Perhaps when
 * clicking on the top one, it gives the option of the multiple ones that
 * are sitting behind for the staff to click on."
 *
 * shared/appointmentCardOverlap.ts already decides that three dogs in a
 * 94px column cascade rather than split, because a split card there is
 * one letter wide. What it cannot do is make the buried cards
 * REACHABLE: whichever card is drawn last owns the tap target across
 * most of the column, so the ones beneath it cannot be opened at all.
 * The photo shows three dogs in Ashleigh's 8-10am where only the top
 * name can be read, and only the top card can be tapped.
 *
 * A card is in the stack when its drawn time range genuinely overlaps
 * the tapped one's — not merely when it shares a cluster.
 * `computeColumns` groups a CHAIN of overlaps, so A can be in a cluster
 * with C without touching it; those two sit at different heights and
 * cover nothing, and offering them would be asking staff to choose
 * between cards they can already see and tap.
 */

/**
 * The shortest a card is ever DRAWN, in minutes.
 *
 * A 15-minute booking is drawn 30 minutes tall, so two back-to-back
 * quarter-hours do not overlap in the data and do overlap on the board.
 * The picker has to match the board, not the data, or it will offer
 * nothing for a pair that is visibly stacked. Calendar.tsx floors the
 * card height with this same constant so the two cannot drift.
 */
export const MIN_DRAWN_MINUTES = 30;

export type StackCandidate = {
  id: number;
  startMs: number;
  endMs: number;
};

/** The span a card actually occupies on the board. */
function drawnEnd(item: StackCandidate): number {
  return Math.max(item.endMs, item.startMs + MIN_DRAWN_MINUTES * 60_000);
}

/**
 * Every card sharing screen space with `targetId`, the target included,
 * in the order they are drawn (earliest start first, id as tiebreak).
 *
 * Returns an EMPTY array when nothing overlaps, so a caller can treat
 * "no stack" and "a stack of one" as the same thing and open the
 * appointment directly — one tap, exactly as before, for the vast
 * majority of the board.
 */
export function appointmentStack(
  items: readonly StackCandidate[],
  targetId: number,
): StackCandidate[] {
  const target = items.find((item) => item.id === targetId);
  if (!target) return [];

  const targetEnd = drawnEnd(target);
  const stack = items.filter(
    (item) =>
      item.id === targetId ||
      (item.startMs < targetEnd && target.startMs < drawnEnd(item)),
  );

  if (stack.length < 2) return [];
  return stack.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
}

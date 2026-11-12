/**
 * Whether a booking may be repeated as a series, and why not.
 *
 * Every row a repeat creates is `confirmed`, so repeating something nobody
 * agreed to would confirm a year of it on its behalf. But `pending` means
 * two different things here: an online request waiting for the salon to
 * accept it, and a MoeGo booking that was "Unconfirmed" when it was
 * imported — 2,067 upcoming rows on 12/11/2026, none booked online. The
 * second is a real booking. Refusing it blocked Lauren setting up Hunter's
 * 6-weekly membership series.
 */
export function repeatBookingRefusal(source: {
  status: string | null;
  workflowState: string | null;
  bookedOnline: boolean | number | null;
}): string | null {
  if (source.status === "cancelled" || source.workflowState === "cancelled") {
    return "That booking is cancelled — repeating it would book a series nobody asked for";
  }
  if (source.status === "pending" && Boolean(Number(source.bookedOnline))) {
    return "That online booking has not been accepted yet — approve it before repeating it";
  }
  if (source.status === "no_show" || source.workflowState === "no_show") {
    return "That dog did not turn up for this booking — repeating it would book a year from a no-show";
  }
  return null;
}

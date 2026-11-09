import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * The total and a way to take it, pinned to the appointment panel.
 *
 * Andy, 09/11/2026, with MoeGo's booking panel open: "Show the total
 * 'estimated price' in Groomigo when an appt is clicked on and also the
 * option to be able to 'Take Payment' as the two default buttons."
 *
 * Both already existed. SplitPaymentPanel has carried the totals and the
 * button for weeks — they just sit at the BOTTOM of the Details tab,
 * below the groomer, the times, the discount and the notes, and are not
 * on the screen at all from the other three tabs. A number you have to
 * go looking for is not a number the person at the counter has.
 *
 * ## It asks the same query, not its own
 *
 * payments.forBooking is what the panel below uses, and a booking is
 * every dog sharing a sessionId — so a two-dog family shows one total
 * here, which is the figure the client is about to be asked for.
 * Querying it again costs nothing: TanStack keys on the same
 * appointmentId and serves both from one fetch, which also means the
 * footer and the panel cannot show different money.
 *
 * ## What it shows, and when
 *
 * "Estimated total" while nothing is paid, because that is what MoeGo
 * calls it and what it is: prices on a booking that has not happened.
 * Once part of it is paid the headline becomes what is still OWING,
 * since that is the only number anybody needs at that point, and the
 * total moves to the line beneath it.
 *
 * Paid in full, the button goes. Offering "Take payment" on a settled
 * booking invites a second charge.
 */
export function ApptPanelFooter({
  appointmentId,
  onTakePayment,
}: {
  appointmentId: number;
  onTakePayment: () => void;
}) {
  const { data } = trpc.payments.forBooking.useQuery({ appointmentId });

  // Before the query answers there is nothing honest to show: a $0.00
  // that becomes $145.00 a moment later is worse than a blank.
  if (!data) return null;

  const total = Number(data.bookingTotal ?? 0);
  const paid = Number(data.bookingPaid ?? 0);
  const owing = Number(data.bookingOutstanding ?? 0);
  const settled = owing <= 0 && total > 0;
  const partPaid = paid > 0 && owing > 0;

  const money = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  return (
    /*
     * A bar of its own, outside the scroll. NOT sticky, and NOT
     * translucent.
     *
     * Andy, 09/11/2026: "The total and take payment button should be a
     * seperate element down the bottom so it doesn't cause any overlap."
     *
     * The first version was `sticky bottom-0` with a `bg-background/95`
     * backdrop-blur. Both were wrong for the same reason: a sticky child
     * of a scroll container is MEANT to have content pass under it, and
     * the translucency let you read the rows going past. The panel now
     * puts this below the scrolling body instead (see Calendar.tsx), so
     * the pinning is structural and the background can be solid.
     *
     * `-mx-6 px-6` still takes it out to the panel's edges under the
     * p-6, and `shrink-0` stops the flex column squeezing it when the
     * body is long.
     */
    <div className="-mx-6 mt-2 shrink-0 border-t bg-background px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {partPaid ? "Still owing" : settled ? "Paid in full" : "Estimated total"}
          </p>
          {/* Andy, 09/11/2026: "larger text and buttons more noticeable
              and prominent." This is the figure somebody reads out to a
              client with a card in their hand. */}
          <p className="text-2xl font-bold tabular-nums leading-tight">
            {partPaid ? money(owing) : money(total)}
          </p>
          {partPaid && (
            <p className="text-[11px] leading-4 text-muted-foreground">
              {money(total)} total · {money(paid)} paid
            </p>
          )}
          {total === 0 && (
            // A membership groom is covered and carries no price. Saying so
            // stops a $0.00 reading as a booking somebody forgot to price.
            <p className="text-[11px] leading-4 text-muted-foreground">
              Nothing to collect
            </p>
          )}
        </div>

        {!settled && total > 0 && (
          <Button type="button" onClick={onTakePayment} size="lg" className="shrink-0 text-base font-semibold">
            Take payment
          </Button>
        )}
      </div>
    </div>
  );
}

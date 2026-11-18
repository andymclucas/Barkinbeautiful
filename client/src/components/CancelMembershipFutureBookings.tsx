import { keptBookingPrice, type FutureBookingChoice } from "@shared/membershipCancelBookings";

export type CancelPreviewBooking = {
  id: number;
  petName: string;
  scheduledStart: Date | string;
  currentPrice: string | null;
  normalPrice: string | null;
};

const day = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const money = (value: string | null) => (value === null ? null : `$${Number(value).toFixed(2)}`);

/**
 * The question asked when a membership is cancelled and the dog still has
 * bookings on it (Andy, 18/11/2026): remove them, or keep them at the
 * normal price.
 *
 * Neither is pre-selected. A default would be an answer nobody gave, and
 * the two outcomes are a long way apart: one empties the diary, the other
 * puts a price on every visit.
 *
 * Plain props and no tRPC so it can be rendered in a test; the cancel
 * dialog owns the choice and the save.
 */
export function CancelMembershipFutureBookings({ bookings, choice, onChoice, disabled = false }: {
  bookings: CancelPreviewBooking[];
  choice: FutureBookingChoice | null;
  onChoice: (choice: FutureBookingChoice) => void;
  disabled?: boolean;
}) {
  if (bookings.length === 0) return null;
  const count = bookings.length;
  // The same rule the server applies: a booking that already has a real
  // price keeps it; only a nil or unpriced one goes to the normal price.
  const outcomeFor = (booking: CancelPreviewBooking) => {
    const kept = keptBookingPrice(booking.currentPrice, booking.normalPrice === null
      ? { price: null, why: "not_on_price_list" }
      : { price: booking.normalPrice, from: "" });
    if (!kept.change) return { text: `keeps ${money(booking.currentPrice)}`, needsPrice: false };
    if (kept.price === null) return { text: "no normal price found", needsPrice: true };
    return { text: `normal price ${money(kept.price)}`, needsPrice: false };
  };
  const needPrice = bookings.filter((booking) => outcomeFor(booking).needsPrice).length;
  const plural = count === 1 ? "booking" : "bookings";

  return (
    <fieldset className="space-y-2 rounded-lg border p-3 text-sm" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold">
        {count} future {plural} on this membership
      </legend>

      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
        {bookings.map((booking) => (
          <li key={booking.id} className="flex items-baseline justify-between gap-3">
            <span>
              <span className="font-medium">{booking.petName}</span>, {day(booking.scheduledStart)}
            </span>
            <span className="shrink-0 text-muted-foreground">{outcomeFor(booking).text}</span>
          </li>
        ))}
      </ul>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted">
        <input
          type="radio"
          name="future-bookings"
          className="mt-0.5 h-4 w-4 accent-primary"
          checked={choice === "keep"}
          onChange={() => onChoice("keep")}
        />
        <span>
          <span className="font-medium">Keep the {plural}</span>
          <span className="block text-xs text-muted-foreground">
            {count === 1 ? "It comes" : "They come"} off the membership. A booking the membership had made free goes to
            the normal price for the service and the dog&rsquo;s size; one that already has a price keeps it.
            {needPrice > 0 && (
              <> {needPrice === count ? (count === 1 ? "This one has" : "These have") : `${needPrice} of them ${needPrice === 1 ? "has" : "have"}`} no normal price on the price list, so the price will be left blank for you to fill in.</>
            )}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted">
        <input
          type="radio"
          name="future-bookings"
          className="mt-0.5 h-4 w-4 accent-primary"
          checked={choice === "remove"}
          onChange={() => onChoice("remove")}
        />
        <span>
          <span className="font-medium">Remove the {plural}</span>
          <span className="block text-xs text-muted-foreground">
            {count === 1 ? "It is" : "All " + count + " are"} cancelled and come off the calendar. The client is not texted, so let them know.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

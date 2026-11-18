import { Input } from "@/components/ui/input";
import { PRICE_TIERS, PRICE_TIER_LABELS, type PriceTier } from "@shared/groomPricing";
import { hasRealPrice, type FutureBookingChoice } from "@shared/membershipCancelBookings";
import { serviceLabel } from "@shared/serviceTypes";
import type { SizePriceChoice, SizePriceDecision } from "@shared/sizeChangePricing";

export type CancelPreviewBooking = {
  id: number;
  petName: string;
  scheduledStart: Date | string;
  serviceType: string;
  currentPrice: string | null;
  choices: SizePriceChoice[];
  /** A discount on the booking. Choosing a new price removes it. */
  discountPercent?: number | null;
  /** The bill was set by hand, so a new price would not change what is charged. */
  hasBillingOverride?: boolean;
  /** Dollars already taken against this booking. */
  alreadyPaid?: number;
};

const day = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const money = (value: string | number | null) => (value === null ? null : `$${Number(value).toFixed(2)}`);

/**
 * The questions asked when a membership is cancelled and the dog still
 * has bookings on it (Andy, 18/11/2026).
 *
 * First: remove the bookings, or keep them. Neither is pre-selected — a
 * default would be an answer nobody gave.
 *
 * Then, for bookings being kept, what each one costs. The price list's
 * new-client, regular-client and VIP rates for that service at the dog's
 * size are offered beside a box for their own figure ("0024 gives 3 rates
 * plus custom rate"). The system never picks one. A booking that already
 * has a real price starts on keeping it; one the membership had made free
 * starts unanswered and has to be answered before the cancel goes ahead.
 *
 * Plain props and no tRPC so it can be rendered in a test; the cancel
 * dialog owns the choice, the decisions and the save.
 */
export function CancelMembershipFutureBookings({ bookings, choice, onChoice, decisions, onDecision, errors = {}, disabled = false }: {
  bookings: CancelPreviewBooking[];
  choice: FutureBookingChoice | null;
  onChoice: (choice: FutureBookingChoice) => void;
  decisions: Record<number, SizePriceDecision | undefined>;
  onDecision: (bookingId: number, decision: SizePriceDecision) => void;
  errors?: Record<number, string>;
  disabled?: boolean;
}) {
  if (bookings.length === 0) return null;
  const count = bookings.length;
  const plural = count === 1 ? "booking" : "bookings";

  // One press to answer every FREE booking the same way. Only the free
  // ones: a booking that already has a real price was priced on purpose
  // (often in MoeGo), and one button must not overwrite a row of those.
  const freeBookings = bookings.filter((booking) => !hasRealPrice(booking.currentPrice) && !booking.hasBillingOverride);
  const tiersOffered = PRICE_TIERS.filter((tier) => freeBookings.some((booking) => booking.choices.some((c) => c.tier === tier)));
  const useForAll = (tier: PriceTier) => {
    for (const booking of freeBookings) {
      if (booking.choices.some((c) => c.tier === tier)) onDecision(booking.id, { kind: "tier", tier });
    }
  };
  const unanswered = Object.keys(errors).length;

  return (
    <fieldset className="space-y-2 rounded-lg border p-3 text-sm" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold">
        {count} future {plural} on this membership
      </legend>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted">
        <input type="radio" name="future-bookings" className="mt-0.5 h-4 w-4 accent-primary" checked={choice === "keep"} onChange={() => onChoice("keep")} />
        <span>
          <span className="font-medium">Keep the {plural}</span>
          <span className="block text-xs text-muted-foreground">
            {count === 1 ? "It comes" : "They come"} off the membership, and you choose what {count === 1 ? "it costs" : "each one costs"}.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted">
        <input type="radio" name="future-bookings" className="mt-0.5 h-4 w-4 accent-primary" checked={choice === "remove"} onChange={() => onChoice("remove")} />
        <span>
          <span className="font-medium">Remove the {plural}</span>
          <span className="block text-xs text-muted-foreground">
            {count === 1 ? "It is" : "All " + count + " are"} cancelled and come off the calendar. The client is not texted, so let them know.
          </span>
        </span>
      </label>

      {choice !== "keep" && (
        <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex items-baseline justify-between gap-3">
              <span><span className="font-medium">{booking.petName}</span>, {day(booking.scheduledStart)}</span>
              <span className="shrink-0 text-muted-foreground">{hasRealPrice(booking.currentPrice) ? money(booking.currentPrice) : "free on the membership"}</span>
            </li>
          ))}
        </ul>
      )}

      {choice === "keep" && (
        <div className="space-y-2">
          {freeBookings.length > 1 && tiersOffered.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Set every free booking to:</span>
              {tiersOffered.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className="rounded-md border px-2 py-0.5 font-medium hover:bg-muted"
                  onClick={() => useForAll(tier)}
                >
                  {PRICE_TIER_LABELS[tier]} rate
                </button>
              ))}
            </p>
          )}
          <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
            {bookings.map((booking) => {
              const real = hasRealPrice(booking.currentPrice);
              const decision = decisions[booking.id] ?? (real ? { kind: "leave" as const } : undefined);
              const group = `kept-price-${booking.id}`;
              return (
                <li key={booking.id} className="rounded-md border p-2">
                  <p className="font-medium">
                    {booking.petName}, {day(booking.scheduledStart)} · {serviceLabel(booking.serviceType)}
                  </p>
                  {booking.hasBillingOverride ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      The bill for this booking was set by hand, so it is kept as it is. Change it on the booking itself.
                    </p>
                  ) : (
                  <div className="mt-1.5 space-y-1">
                    {(booking.discountPercent ?? 0) > 0 && (
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        This booking has a {booking.discountPercent}% discount. Choosing a new price removes it.
                      </p>
                    )}
                    {(booking.alreadyPaid ?? 0) > 0 && (
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        {money(booking.alreadyPaid ?? 0)} has already been paid on this booking.
                      </p>
                    )}
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name={group} className="h-4 w-4 accent-primary" checked={decision?.kind === "leave"} onChange={() => onDecision(booking.id, { kind: "leave" })} />
                      <span>{real ? `Keep the price on it (${money(booking.currentPrice)})` : "No price yet (fill it in later)"}</span>
                    </label>
                    {booking.choices.map((option) => (
                      <div key={option.tier}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name={group}
                            className="h-4 w-4 accent-primary"
                            checked={decision?.kind === "tier" && decision.tier === option.tier}
                            onChange={() => onDecision(booking.id, { kind: "tier", tier: option.tier })}
                          />
                          <span>{option.label}: {money(option.price)}</span>
                        </label>
                        <p className="ml-6 text-[11px] text-muted-foreground">{option.from}</p>
                      </div>
                    ))}
                    {booking.choices.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No rate found on the price list for this service at this dog&rsquo;s size, or the dog has no size set.
                      </p>
                    )}
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={group}
                        className="h-4 w-4 accent-primary"
                        checked={decision?.kind === "custom"}
                        onChange={() => onDecision(booking.id, { kind: "custom", amount: decision?.kind === "custom" ? decision.amount : "" })}
                      />
                      <span>Your own price: $</span>
                      <Input
                        aria-label={`Your own price for ${booking.petName}, ${day(booking.scheduledStart)}`}
                        inputMode="decimal"
                        className="h-8 w-28"
                        value={decision?.kind === "custom" ? decision.amount : ""}
                        onFocus={() => { if (decision?.kind !== "custom") onDecision(booking.id, { kind: "custom", amount: "" }); }}
                        onChange={(event) => onDecision(booking.id, { kind: "custom", amount: event.target.value })}
                      />
                    </label>
                    {errors[booking.id] && <p role="alert" className="text-xs text-destructive">{errors[booking.id]}</p>}
                  </div>
                  )}
                </li>
              );
            })}
          </ul>
          {unanswered > 0 && (
            <p className="text-xs font-medium text-destructive">
              {unanswered === 1 ? "1 booking still needs" : `${unanswered} bookings still need`} an answer above.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

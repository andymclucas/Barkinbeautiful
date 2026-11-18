import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { serviceLabel } from "@shared/serviceTypes";
import { resolveSizePrice, type SizePriceChoice, type SizePriceDecision } from "@shared/sizeChangePricing";

export type SizeReviewBooking = {
  id: number;
  scheduledStart: Date | string;
  serviceType: string;
  currentPrice: string | null;
  onMembership: boolean;
  choices: SizePriceChoice[];
  /** A discount on the booking. Choosing a new price removes it. */
  discountPercent?: number | null;
  /** The bill is fixed by an override, so a new price would not change what is charged. */
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

const money = (value: string | number | null) =>
  value === null || value === "" ? null : `$${Number(value).toFixed(2)}`;

/** A groom the membership pays for: nothing on it to reprice. */
const paidByMembership = (booking: SizeReviewBooking) =>
  booking.onMembership && (booking.currentPrice === null || Number(booking.currentPrice) === 0);

/**
 * The question asked after a dog's size changes: what should its
 * upcoming bookings cost now? (Andy, 18/11/2026.)
 *
 * Each booking shows the price on it and the price list's three rates
 * for that service at the dog's new size. Staff pick one, type their
 * own, or leave it — and "leave it" is where every booking starts, so
 * closing the box changes nothing.
 *
 * Plain props and no tRPC, so it can be rendered in a test. `onApply`
 * gets only the bookings whose price really changes.
 */
export function SizeChangePriceReview({ petName, sizeLabel, membershipName, bookings, saving, onApply, onClose }: {
  petName: string;
  /** "Small (0–10 kg)", or null when the dog has no size. */
  sizeLabel: string | null;
  membershipName: string | null;
  bookings: SizeReviewBooking[];
  saving: boolean;
  onApply: (changes: { appointmentId: number; price: string }[]) => void;
  onClose: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<number, SizePriceDecision>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const decisionFor = (id: number): SizePriceDecision => decisions[id] ?? { kind: "leave" };
  const decide = (id: number, decision: SizePriceDecision) => {
    setDecisions((previous) => ({ ...previous, [id]: decision }));
    setErrors((previous) => {
      const { [id]: _gone, ...rest } = previous;
      return rest;
    });
  };

  const priceable = bookings.filter((booking) => !paidByMembership(booking) && !booking.hasBillingOverride);

  const apply = () => {
    const changes: { appointmentId: number; price: string }[] = [];
    const found: Record<number, string> = {};
    for (const booking of priceable) {
      const resolved = resolveSizePrice({
        decision: decisionFor(booking.id),
        choices: booking.choices,
        currentPrice: booking.currentPrice,
      });
      if ("error" in resolved) found[booking.id] = resolved.error;
      else if (resolved.change) changes.push({ appointmentId: booking.id, price: resolved.price });
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (changes.length === 0) onClose();
    else onApply(changes);
  };

  const changing = priceable.filter((booking) => decisionFor(booking.id).kind !== "leave").length;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {petName} is now {sizeLabel ?? "a different size"}. Size sets the price, so check {petName}&rsquo;s upcoming
        booking{bookings.length === 1 ? "" : "s"}. Nothing changes unless you choose a price.
      </p>

      {membershipName && (
        <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {petName} is on a membership ({membershipName}). Memberships are sold by size, so check the plan and its
          weekly price still match. This does not change the membership.
        </p>
      )}

      {bookings.length === 0 && <p className="font-medium">No upcoming bookings to check.</p>}

      <ul className="max-h-[50vh] space-y-3 overflow-y-auto">
        {bookings.map((booking) => {
          const decision = decisionFor(booking.id);
          const group = `size-price-${booking.id}`;
          return (
            <li key={booking.id} className="rounded-lg border p-3">
              <p className="font-medium">
                {day(booking.scheduledStart)} · {serviceLabel(booking.serviceType)}
              </p>
              {paidByMembership(booking) ? (
                <p className="mt-1 text-xs text-muted-foreground">Paid for by the membership, so there is no price to change.</p>
              ) : booking.hasBillingOverride ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  The bill for this booking has been set by hand, so a new price here would not change what is charged.
                  Change it on the booking itself.
                </p>
              ) : (
                <fieldset className="mt-2 space-y-1.5" disabled={saving}>
                  <legend className="sr-only">Price for {day(booking.scheduledStart)}</legend>
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
                    <input type="radio" name={group} className="h-4 w-4 accent-primary" checked={decision.kind === "leave"} onChange={() => decide(booking.id, { kind: "leave" })} />
                    <span>Leave as it is ({money(booking.currentPrice) ?? "no price yet"})</span>
                  </label>
                  {booking.choices.map((choice) => (
                    <div key={choice.tier}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name={group}
                          className="h-4 w-4 accent-primary"
                          checked={decision.kind === "tier" && decision.tier === choice.tier}
                          onChange={() => decide(booking.id, { kind: "tier", tier: choice.tier })}
                        />
                        <span>{choice.label}: {money(choice.price)}</span>
                      </label>
                      {/* Which price-list row this is, in words, so a
                          long-coat price is not mistaken for a short one. */}
                      <p className="ml-6 text-[11px] text-muted-foreground">{choice.from}</p>
                    </div>
                  ))}
                  {booking.choices.length === 0 && (
                    <p className="text-xs text-muted-foreground">The price list has no price for this service at this size.</p>
                  )}
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={group}
                      className="h-4 w-4 accent-primary"
                      checked={decision.kind === "custom"}
                      onChange={() => decide(booking.id, { kind: "custom", amount: decision.kind === "custom" ? decision.amount : "" })}
                    />
                    <span>Your own price: $</span>
                    <Input
                      aria-label={`Your own price for ${day(booking.scheduledStart)}`}
                      inputMode="decimal"
                      className="h-8 w-28"
                      value={decision.kind === "custom" ? decision.amount : ""}
                      onFocus={() => { if (decision.kind !== "custom") decide(booking.id, { kind: "custom", amount: "" }); }}
                      onChange={(event) => decide(booking.id, { kind: "custom", amount: event.target.value })}
                    />
                  </label>
                  {errors[booking.id] && <p role="alert" className="text-xs text-destructive">{errors[booking.id]}</p>}
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>
          {changing > 0 ? "Cancel" : "Close"}
        </Button>
        {priceable.length > 0 && (
          <Button size="sm" disabled={saving || changing === 0} onClick={apply}>
            {saving ? "Saving…" : changing === 1 ? "Update 1 price" : changing > 1 ? `Update ${changing} prices` : "Update prices"}
          </Button>
        )}
      </div>
    </div>
  );
}

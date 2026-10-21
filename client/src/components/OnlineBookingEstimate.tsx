import { Info } from "lucide-react";
import { formatEstimate } from "@shared/onlineBookingConfirmation";

/**
 * The price on the public booking form.
 *
 * Andy, 21/10/2026: "Price needs to have a disclaimer that although
 * price is dependant on dog weight and appt duration, this is subject to
 * change."
 *
 * The disclaimer is not optional decoration and is not a tooltip. It is
 * rendered in the same block as the figure, every time, at a size
 * someone actually reads — a price with a caveat the client has to hover
 * to find is a quote with deniability, and the salon is the one who has
 * the argument on the doorstep.
 *
 * `disclaimer` is passed in rather than imported so it comes from the
 * same server response as the price. The server returns null for it when
 * there is no figure, which is what makes "a price without its
 * disclaimer" unrepresentable here rather than merely discouraged.
 */
export function OnlineBookingEstimate({
  price,
  range,
  reason,
  disclaimer,
  loading = false,
  className = "",
}: {
  price: string | null | undefined;
  /**
   * Shown when the catalogue has several legitimate prices for this dog
   * and its weight cannot choose between them — a de-shed, where the
   * figure depends on how long the coat takes. Showing the span is
   * honest; picking the cheapest of it is not.
   */
  range?: { low: string; high: string } | null;
  reason?: string | null;
  disclaimer: string | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  const formatted = formatEstimate(price);
  const low = formatEstimate(range?.low);
  const high = formatEstimate(range?.high);

  if (loading) {
    return (
      <p className={`text-sm text-muted-foreground ${className}`} data-testid="estimate-loading">
        Checking the price…
      </p>
    );
  }

  // A range instead of a figure. Same block, same prominence, same
  // disclaimer — the client is being told about money either way.
  if (!formatted && low && high && low !== high) {
    return (
      <div
        className={`rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/40 ${className}`}
        data-testid="estimate-range"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">Price guide</span>
          <span className="text-xl font-bold tabular-nums text-violet-800 dark:text-violet-200">
            {low} – {high}
          </span>
        </div>
        <p className="mt-2 flex gap-2 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
          <span>{reason ?? disclaimer}</span>
        </p>
      </div>
    );
  }

  // No figure at all: say so plainly rather than showing nothing, which
  // reads as "free" to an optimist and as a broken form to everyone else.
  if (!formatted) {
    return (
      <p className={`text-sm text-muted-foreground ${className}`} data-testid="estimate-unknown">
        {reason ?? "We'll confirm the price for this groom when we come back to you."}
      </p>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/40 ${className}`}
      data-testid="estimate"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">Estimated price</span>
        <span className="text-2xl font-bold tabular-nums text-violet-800 dark:text-violet-200">
          {formatted}
        </span>
      </div>
      {disclaimer && (
        <p className="mt-2 flex gap-2 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
          <span>{disclaimer}</span>
        </p>
      )}
    </div>
  );
}

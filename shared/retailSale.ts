/**
 * Selling a retail product on a booking.
 *
 * Andy, 09/11/2026: "Add retail items into the appointment card so
 * these can be added to the cart for checkout."
 *
 * ## The cart already exists
 *
 * `appointment_add_ons` holds the extra lines on a booking. They feed
 * `addOnsTotal`, which feeds `payments.forBooking`, which is the figure
 * the appointment panel shows and the amount Take payment collects.
 * They carry per-line discounts and become invoice_line_items.
 *
 * A retail product wants every one of those. So it becomes a line in
 * that table, with `retail_product_id` set where a service add-on would
 * set `pricing_service_id` — and gets the whole path for free rather
 * than a second table that would have to re-earn it.
 *
 * ## Stock moves when the item does, not when the money does
 *
 * Decrementing at payment time would leave the shelf and the screen
 * disagreeing for as long as the dog is in the salon, and a line that
 * is never paid — the client changes their mind, the booking is
 * cancelled — would leave stock wrong for ever with nothing to notice
 * it.
 *
 * So stock falls when the line is added and comes back when the line is
 * removed, which is what the physical shelf does. The invariant that
 * matters: every add has exactly one matching restore.
 *
 * ## Selling past zero is allowed, and said out loud
 *
 * The count in `retail_products.stock_qty` is what somebody last typed
 * in, not what is on the shelf. Refusing a sale because the number says
 * zero would stop a real sale over a stale figure, in front of a client
 * holding the thing. So the sale goes through and the response says the
 * count has gone negative, which is a prompt to do a stocktake rather
 * than an error.
 */

export type RetailStockWarning =
  | { kind: "none" }
  | { kind: "last_one"; remaining: number }
  | { kind: "oversold"; remaining: number };

/**
 * What the shelf looks like after selling `quantity` of something that
 * had `stockQty` on it.
 *
 * Returns the new count even when it goes below zero — see the note
 * above. The caller writes it and shows the warning.
 */
export function stockAfterSale(stockQty: number, quantity: number): {
  remaining: number;
  warning: RetailStockWarning;
} {
  const remaining = stockQty - quantity;
  if (remaining < 0) return { remaining, warning: { kind: "oversold", remaining } };
  if (remaining === 0) return { remaining, warning: { kind: "last_one", remaining } };
  return { remaining, warning: { kind: "none" } };
}

/** One line for the person at the counter, or null when there is nothing to say. */
export function describeStockWarning(warning: RetailStockWarning, name: string): string | null {
  switch (warning.kind) {
    case "none":
      return null;
    case "last_one":
      return `That was the last ${name} on the shelf.`;
    case "oversold":
      /* Named as a counting problem rather than a sale problem: the sale
         happened, the number is what is wrong. */
      return `${name} is now showing ${warning.remaining} in stock — worth a recount.`;
  }
}

/**
 * Whether a line in appointment_add_ons is a retail sale.
 *
 * A line is a service add-on or a retail product, never both. Asking
 * this one way, in one place, is what stops the two drifting apart
 * where the totals and the invoice lines read them.
 */
export function isRetailLine(line: {
  retailProductId?: number | null;
  pricingServiceId?: number | null;
}): boolean {
  return line.retailProductId !== null && line.retailProductId !== undefined;
}

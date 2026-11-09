/**
 * Selling retail to somebody who has not booked a groom.
 *
 * Lauren Romari, 10/11/2026, to Andy: "what happens if someone walks in
 * just wanting to buy retail?" Nothing did. Every way to put a product
 * on a bill went through a booking — `appointment_add_ons.appointment_id`
 * is NOT NULL and `appointment_payments.appointment_id` is NOT NULL with
 * a foreign key — so a walk-in buying a bag of treats had nowhere to go
 * but a fake appointment on the diary.
 *
 * ## Why this is an invoice and not a new table
 *
 * `invoices.appointment_id` is already nullable and
 * `invoice_line_items.product_id` already points at the retail
 * catalogue. The column has existed since the invoice schema was
 * written and NOTHING has ever set it. The client record's "Total paid"
 * tile already sums invoices with no booking behind them, and its own
 * comment says what they are: "retail, arrears, ad-hoc". A counter sale
 * is the case that was designed for and never built.
 *
 * A second table would have had to re-earn invoicing, the pay-by-link
 * path, the emailed receipt and that revenue tile.
 *
 * ## Money
 *
 * Prices are dollars as decimal strings in the database and this adds
 * them in CENTS, because 0.1 + 0.2 is not 0.3 and a till that is a cent
 * out is a till nobody trusts.
 *
 * Tax is "0" and total equals subtotal. That is not a decision made
 * here — every invoice this app has ever raised does it, because the
 * salon's shelf and service prices are GST-inclusive. If that ever
 * changes it changes in one place for all of them, not just for this.
 *
 * ## Stock
 *
 * Follows `shared/retailSale.ts` exactly: the shelf moves when the item
 * does, selling past zero is allowed and said out loud. A counter sale
 * is the same physical act as putting a bag of treats on a booking, so
 * it must not behave differently.
 */

/** A till receipt with more lines than this is a stocktake, not a sale. */
export const MAX_COUNTER_SALE_LINES = 20;

/** Matches the per-line cap on `appointmentAddOns.addRetail`. */
export const MAX_LINE_QUANTITY = 20;

export type CounterSaleLine = {
  retailProductId: number;
  /** Snapshot of the product name, so a later rename cannot rewrite this bill. */
  name: string;
  /** Snapshot of the price charged, as dollars: "12.50". */
  unitPrice: string;
  quantity: number;
};

export type CounterSaleTotals = {
  subtotal: string;
  taxAmount: string;
  total: string;
};

/** Dollars as a string to whole cents. NaN and nonsense read as zero. */
function cents(dollars: string | number | null | undefined): number {
  const n = typeof dollars === "number" ? dollars : Number(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function dollars(inCents: number): string {
  return (inCents / 100).toFixed(2);
}

/** What one line costs: unit price times quantity, to the cent. */
export function counterSaleLineTotal(
  line: Pick<CounterSaleLine, "unitPrice" | "quantity">
): string {
  return dollars(
    cents(line.unitPrice) * Math.max(0, Math.trunc(line.quantity))
  );
}

/**
 * What the sale comes to.
 *
 * Summed in cents, then formatted once. Formatting each line and adding
 * the strings back up is how a receipt ends up a cent off its own lines.
 */
export function counterSaleTotals(
  lines: readonly CounterSaleLine[]
): CounterSaleTotals {
  const subtotal = lines.reduce(
    (sum, line) =>
      sum + cents(line.unitPrice) * Math.max(0, Math.trunc(line.quantity)),
    0
  );
  return {
    subtotal: dollars(subtotal),
    taxAmount: "0",
    total: dollars(subtotal),
  };
}

/**
 * Why a set of lines cannot be sold, or null when it can.
 *
 * Returned rather than thrown so the till can grey out the button with
 * the reason on it, and so the server can refuse with the same sentence.
 */
export function counterSaleRefusal(
  lines: readonly CounterSaleLine[]
): string | null {
  if (lines.length === 0) return "Add something to the sale first.";
  if (lines.length > MAX_COUNTER_SALE_LINES) {
    return `A counter sale takes up to ${MAX_COUNTER_SALE_LINES} lines.`;
  }
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return `${line.name} needs a quantity of at least 1.`;
    }
    if (line.quantity > MAX_LINE_QUANTITY) {
      return `${line.name}: ${MAX_LINE_QUANTITY} is the most that can go on one line.`;
    }
    if (cents(line.unitPrice) < 0)
      return `${line.name} cannot have a negative price.`;
  }
  /* A sale of nothing is allowed to exist — a $0 giveaway still moves
     stock and should still be recorded — but it is not a PAYMENT, and
     the caller is told so rather than being handed a $0 paid invoice. */
  return null;
}

/**
 * The receipt number.
 *
 * Shaped like `groomInvoiceNumber` so the two are indistinguishable on a
 * statement, and prefixed SHOP so a counter sale is recognisable without
 * opening it. Brisbane date, because the salon's day is the one a staff
 * member means when they say "that sale this morning".
 */
export function counterSaleInvoiceNumber(at: Date, unique: string): string {
  const day = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })
    .format(at)
    .replace(/\//g, "");
  return `SHOP-${day}-${unique.toUpperCase()}`;
}

/** One line for the invoice note and the confirmation toast. */
export function describeCounterSale(lines: readonly CounterSaleLine[]): string {
  if (lines.length === 0) return "Counter sale";
  return lines
    .map(line =>
      line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name
    )
    .join(", ");
}

/**
 * Whether a counter sale is settled on the spot.
 *
 * Paid at the counter is the normal case and the invoice should say so
 * rather than showing the client a bill they have already paid — the
 * same reasoning as `invoiceStatusForPayments` on a groom. A sale rung
 * up with no payment stays a draft bill to be sent.
 */
export function counterSaleStatus(paidAtCounter: boolean): "paid" | "draft" {
  return paidAtCounter ? "paid" : "draft";
}

/**
 * Extras done on the day, and the itemised invoice they produce.
 *
 * The salon's add-ons already exist as priced catalogue entries — anal
 * glands, teeth cleaning, flea rinse, a de-matt on an overgrown coat —
 * but nothing recorded which ones were actually done, so every invoice
 * was a single line for the groom and the extras were either lost or
 * folded invisibly into the price.
 *
 * Money is added up in CENTS here and only turned back into dollars at
 * the end. Summing "35.00" + "65.00" as floats is how an invoice ends up
 * reading 99.99999999999999, and the appointment price and every add-on
 * price arrive from the database as decimal strings.
 */

export type AddOnLine = {
  name: string;
  /** Dollars, as stored. "35.00". */
  unitPrice: string | number;
  quantity?: number;
};

export type InvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

/** Dollars (string or number) to whole cents. Unreadable values are 0. */
export function toCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Cents back to the decimal string the invoice columns hold. */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Which catalogue price modes carry no usable number.
 *
 * "Colour / Dye" and "Daycare" are quoted per dog, so there is nothing to
 * copy from the catalogue and staff have to type the agreed figure. A
 * quote-priced add-on silently entered at $0 would be work given away.
 */
export function addOnRequiresManualPrice(priceMode: string | null | undefined): boolean {
  return priceMode === "quote" || priceMode === "range" || priceMode === "from";
}

/**
 * The lines an appointment's invoice should carry.
 *
 * The groom first, then each add-on in the order they were added, so the
 * client reads it the way the day happened. An add-on with no price still
 * appears, at zero: it was done, and hiding it would make the invoice
 * disagree with the grooming card.
 */
export function buildInvoiceLines(input: {
  petName: string | null | undefined;
  serviceLabel: string;
  servicePrice: string | number | null | undefined;
  addOns: AddOnLine[];
}): { lines: InvoiceLine[]; subtotalCents: number; subtotal: string } {
  const pet = input.petName?.trim() || "Pet";
  const serviceCents = toCents(input.servicePrice);

  const lines: InvoiceLine[] = [{
    description: `${pet} — ${input.serviceLabel}`,
    quantity: "1",
    unitPrice: centsToAmount(serviceCents),
    lineTotal: centsToAmount(serviceCents),
  }];

  let subtotalCents = serviceCents;
  for (const addOn of input.addOns) {
    // Quantity is whole: two nail paintings, not 1.5 of one.
    const quantity = Math.max(1, Math.round(addOn.quantity ?? 1));
    const unitCents = toCents(addOn.unitPrice);
    const lineCents = unitCents * quantity;
    subtotalCents += lineCents;
    lines.push({
      description: addOn.name,
      quantity: String(quantity),
      unitPrice: centsToAmount(unitCents),
      lineTotal: centsToAmount(lineCents),
    });
  }

  return { lines, subtotalCents, subtotal: centsToAmount(subtotalCents) };
}

/**
 * What the appointment is now worth: its own price plus its add-ons.
 *
 * Kept separate from buildInvoiceLines because the figure is needed in
 * places that are not raising an invoice — showing a running total on the
 * appointment, and deciding whether there is anything to bill at all.
 */
export function appointmentTotal(
  servicePrice: string | number | null | undefined,
  addOns: AddOnLine[],
): string {
  let cents = toCents(servicePrice);
  for (const addOn of addOns) {
    cents += toCents(addOn.unitPrice) * Math.max(1, Math.round(addOn.quantity ?? 1));
  }
  return centsToAmount(cents);
}

/** Just the add-ons, for showing what the extras came to on their own. */
export function addOnsTotal(addOns: AddOnLine[]): string {
  let cents = 0;
  for (const addOn of addOns) {
    cents += toCents(addOn.unitPrice) * Math.max(1, Math.round(addOn.quantity ?? 1));
  }
  return centsToAmount(cents);
}

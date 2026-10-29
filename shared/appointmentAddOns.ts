import { applyLineDiscount, discountFromColumns, describeLineDiscount } from "./lineDiscount";
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
  /** A discount on this line: percent OR amount, never both. */
  discountPercent?: string | number | null;
  discountAmount?: string | number | null;
  discountReason?: string | null;
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
  /**
   * The groom is paid for by the weekly membership, so it appears on the
   * invoice at zero and only the extras are charged.
   *
   * It still gets a line. A membership client opening a bill for $35 should
   * be able to see WHAT it was on top of — an invoice listing a de-matt and
   * nothing else reads like a mistake.
   */
  membershipCovered?: boolean;
}): { lines: InvoiceLine[]; subtotalCents: number; subtotal: string } {
  const pet = input.petName?.trim() || "Pet";
  // Zero, explicitly: never the recorded price. A membership groom should
  // carry no price, and if one ever does, charging it here would bill the
  // client for a groom their membership already paid for.
  const serviceCents = input.membershipCovered ? 0 : toCents(input.servicePrice);

  const lines: InvoiceLine[] = [{
    description: input.membershipCovered
      ? `${pet} — ${input.serviceLabel} (covered by membership)`
      : `${pet} — ${input.serviceLabel}`,
    quantity: "1",
    unitPrice: centsToAmount(serviceCents),
    lineTotal: centsToAmount(serviceCents),
  }];

  let subtotalCents = serviceCents;
  for (const addOn of input.addOns) {
    // Quantity is whole: two nail paintings, not 1.5 of one.
    const quantity = Math.max(1, Math.round(addOn.quantity ?? 1));
    const unitCents = toCents(addOn.unitPrice);
    const grossCents = unitCents * quantity;
    /**
     * Any discount applies to the line AFTER quantity — 20% off two
     * teeth cleans is 20% off both, not off one of them. The discount is
     * shown on its own line rather than folded into the unit price, so
     * the client can see the full rate and what came off it; a quietly
     * reduced unit price reads like the salon's prices changed.
     */
    const discounted = applyLineDiscount(
      centsToAmount(grossCents),
      discountFromColumns(addOn.discountPercent, addOn.discountAmount),
    );
    const lineCents = discounted.netCents;
    subtotalCents += lineCents;
    lines.push({
      // Named for the dog, like the service line above. On a single-dog
      // invoice that is mildly redundant; on a combined one it is the
      // difference between a reader knowing whose teeth were brushed
      // and guessing. Two dogs, one bill, one line saying "Teeth
      // Brushing" is a question the client has to ring up about.
      description: `${pet} — ${addOn.name}`,
      quantity: String(quantity),
      unitPrice: centsToAmount(unitCents),
      lineTotal: centsToAmount(grossCents),
    });
    if (discounted.discountCents > 0) {
      const label = describeLineDiscount(discounted.discount, discounted.discountCents);
      lines.push({
        description: `${pet} — ${addOn.name}: ${label}${addOn.discountReason ? ` (${addOn.discountReason})` : ""}`,
        quantity: "1",
        unitPrice: centsToAmount(-discounted.discountCents),
        lineTotal: centsToAmount(-discounted.discountCents),
      });
    }
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
    const gross = toCents(addOn.unitPrice) * Math.max(1, Math.round(addOn.quantity ?? 1));
    /**
     * NET, like addOnsTotal and buildInvoiceLines beside it.
     *
     * This summed the full rate and ignored the discount, so a line
     * struck through to $0.00 on screen still had to be paid for.
     * Lauren, 30/10/2026, on Greg Blackaby's booking that morning:
     * "I's done free drop off and pick up discounted the price.. but
     * at the bottom it still says $35." Ruby's $25 pick-up and
     * Charlie's $10 day care were both discounted to nothing, and the
     * counter was being asked for $35.
     *
     * The invoice was always right — buildInvoiceLines discounts
     * properly — so the two figures disagreed, and the one staff take
     * money from was the wrong one.
     */
    cents += applyLineDiscount(
      centsToAmount(gross),
      discountFromColumns(addOn.discountPercent, addOn.discountAmount),
    ).netCents;
  }
  return centsToAmount(cents);
}

/** Just the add-ons, for showing what the extras came to on their own. */
export function addOnsTotal(addOns: AddOnLine[]): string {
  let cents = 0;
  for (const addOn of addOns) {
    const gross = toCents(addOn.unitPrice) * Math.max(1, Math.round(addOn.quantity ?? 1));
    // NET, not gross. This figure feeds decideAppointmentInvoice and the
    // payment panel's "owing", so summing the full rate would have the
    // counter asking a client for money that was discounted off.
    cents += applyLineDiscount(
      centsToAmount(gross),
      discountFromColumns(addOn.discountPercent, addOn.discountAmount),
    ).netCents;
  }
  return centsToAmount(cents);
}

/**
 * What this appointment actually comes to, or null when nobody has priced it.
 *
 * The difference from appointmentTotal is the null, and the null is the
 * whole point: "not priced yet" and "costs nothing" are different, and the
 * payment panel must not show a booking as settled because no figure was
 * ever entered. Most imported history is in that state.
 *
 * An unpriced groom WITH extras is not unpriced any more. A membership
 * groom carries no price on purpose — the weekly payment covers it — but
 * the $35 de-matt done on the day is not covered by anything, and the
 * client owes it.
 */
export function billableTotal(
  servicePrice: string | number | null | undefined,
  addOns: AddOnLine[],
  /**
   * What a person said this dog is actually being charged.
   *
   * When set it replaces the computed figure outright rather than
   * adjusting it — the whole point is the cases that do not decompose
   * into a price and a list of extras. The add-ons stay on the invoice
   * as a record of what was done; they just stop driving the total.
   *
   * Zero is a real override and must survive: "this one is on us" is a
   * decision somebody made, not a missing value.
   */
  billedTotalOverride?: string | number | null,
): string | null {
  const override = parseOverride(billedTotalOverride);
  if (override !== null) return centsToAmount(override);

  const hasPrice =
    servicePrice !== null && servicePrice !== undefined && String(servicePrice).trim() !== "";
  if (!hasPrice && addOns.length === 0) return null;
  return appointmentTotal(hasPrice ? servicePrice : 0, addOns);
}

/** An override in whole cents, or null when there isn't a usable one. */
function parseOverride(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  // A negative bill is not a refund, it is a typo. Ignored rather than
  // stored, so it can never turn into money owed back to a client.
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/** Whether a figure would actually be used as an override. */
export function isUsableBilledOverride(value: string | number | null | undefined): boolean {
  return parseOverride(value) !== null;
}

/**
 * Each appointment's billable total, for a booking that may cover several dogs.
 *
 * Separated from the database so the matching is testable: a two-dog booking
 * is two appointments and one flat list of add-ons, and putting one dog's
 * de-matt on the other dog's bill is the mistake worth a test. Each dog pays
 * for its own extras, which is also how the split-payment panel settles up.
 */
export function billableTotalsByAppointment(
  appointments: ReadonlyArray<{
    id: number;
    price: string | number | null | undefined;
    billedTotalOverride?: string | number | null;
  }>,
  addOns: ReadonlyArray<AddOnLine & { appointmentId: number }>,
): Map<number, string | null> {
  const totals = new Map<number, string | null>();
  for (const appointment of appointments) {
    const own = addOns.filter((addOn) => addOn.appointmentId === appointment.id);
    totals.set(appointment.id, billableTotal(appointment.price, own, appointment.billedTotalOverride));
  }
  return totals;
}

export type AddOnTarget = { appointmentId: number; petName: string };

/**
 * Which appointments one press of Add should write to.
 *
 * A booking with two dogs is two appointment rows, and an extra is
 * recorded against a row. The Calendar dialog used to render a single
 * Add-ons box bound to whichever dog's row happened to be open, so on
 * 29/10/2026 a teeth clean went on one of Heidi Robertson's two dogs
 * and Lauren had to split them across groomers to reach the other.
 *
 * Deliberately returns the dogs rather than a count: the caller names
 * them in the confirmation, and a count alone cannot say which dog a
 * failed write missed.
 */
export function addOnTargets(
  self: AddOnTarget,
  siblings: readonly AddOnTarget[],
  applyToAll: boolean,
): AddOnTarget[] {
  if (!applyToAll || siblings.length === 0) return [self];
  /* Guard the id, not the name: two dogs in one family are often
     called the same thing, and writing an extra twice to one row
     bills it twice. */
  const seen = new Set([self.appointmentId]);
  const out = [self];
  for (const sibling of siblings) {
    if (seen.has(sibling.appointmentId)) continue;
    seen.add(sibling.appointmentId);
    out.push(sibling);
  }
  return out;
}

/**
 * What to tell staff after writing to one or more dogs.
 *
 * A partial write is reported as a partial write. These are separate
 * invoice lines on separate appointments, so a failure on the second
 * dog does not undo the first, and "added" after half a write leaves
 * somebody under-charged with nothing on screen to say so.
 */
export function describeAddOnWrite(opts: {
  name: string;
  attempted: number;
  succeeded: number;
}): string {
  const { name, attempted, succeeded } = opts;
  if (attempted <= 1) return `${name} added`;
  if (succeeded === attempted) return `${name} added to ${attempted} dogs`;
  return `${name} added to ${succeeded} of ${attempted} dogs`;
}

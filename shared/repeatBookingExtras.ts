/**
 * Which extras follow a booking onto its repeats.
 *
 * Lauren, 14/11/2026: a client on a fortnightly groom gets free teeth
 * brushing every visit. The extra sat on one booking and had to be added
 * again, with its discount, on every other one in the series. Extras are
 * stored per booking and nothing carried them.
 *
 * Two rules, both about not charging or giving away the wrong thing:
 *
 * - **Services carry, products do not.** Teeth brushing every visit is a
 *   standing arrangement. A bag of treats bought on the day is not, and
 *   repeating it would put a product on every future bill and take stock
 *   for each one.
 * - **The price and the discount carry as they stand.** They are a
 *   snapshot of what was agreed for this client, which is the whole
 *   point; re-reading the catalogue would drop the deal she was given.
 *   "Done" does not carry: nobody has done the work on a future visit.
 */

export type ExtraLine = {
  pricingServiceId: number | null;
  retailProductId: number | null;
  name: string;
  unitPrice: string;
  quantity: number;
  staffId: number | null;
  discountPercent: string | null;
  discountAmount: string | null;
  discountReason: string | null;
};

export type CarriedExtra = ExtraLine & { pricingServiceId: number; retailProductId: null };

export function carriesToRepeats(line: Pick<ExtraLine, "pricingServiceId" | "retailProductId">): boolean {
  return line.pricingServiceId !== null && line.retailProductId === null;
}

/** The fields a repeat booking's copy of an extra starts with. */
export function extrasCarriedToRepeat(lines: readonly ExtraLine[]): CarriedExtra[] {
  return lines.filter(carriesToRepeats).map((line) => ({
    pricingServiceId: line.pricingServiceId as number,
    retailProductId: null,
    name: line.name,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    staffId: line.staffId,
    discountPercent: line.discountPercent,
    discountAmount: line.discountAmount,
    discountReason: line.discountReason,
  }));
}

export type SeriesBooking = {
  id: number;
  petId: number;
  workflowState: string;
  scheduledStart: Date;
};

/**
 * The later bookings in a series that should receive an extra.
 *
 * Same dog, still `scheduled`, after the booking the extra is on, and not
 * already carrying that service. A booking past `scheduled` is a visit
 * that has started or finished; its bill is not ours to change from here.
 */
export function seriesBookingsNeedingExtra(input: {
  source: Pick<SeriesBooking, "id" | "petId" | "scheduledStart">;
  series: readonly SeriesBooking[];
  /** Booking ids that already have a line for this service. */
  alreadyHaveIt: ReadonlySet<number>;
}): SeriesBooking[] {
  const after = input.source.scheduledStart.getTime();
  return input.series.filter(
    (b) =>
      b.id !== input.source.id &&
      b.petId === input.source.petId &&
      b.workflowState === "scheduled" &&
      b.scheduledStart.getTime() > after &&
      !input.alreadyHaveIt.has(b.id),
  );
}

/** "Added to 12 later bookings" / "…1 later booking" / already-there. */
export function describeSeriesAdd(name: string, added: number): string {
  if (added === 0) return `${name} is already on every later booking in this series`;
  return `${name} added to ${added} later booking${added === 1 ? "" : "s"}`;
}

import { describe, expect, it } from "vitest";
import {
  toCents, centsToAmount, addOnRequiresManualPrice,
  buildInvoiceLines, appointmentTotal, addOnsTotal, billableTotal,
  billableTotalsByAppointment, isUsableBilledOverride } from "@shared/appointmentAddOns";

describe("money arrives as decimal strings and must stay exact", () => {
  it("converts both strings and numbers", () => {
    expect(toCents("35.00")).toBe(3500);
    expect(toCents(35)).toBe(3500);
    expect(toCents("0.05")).toBe(5);
    expect(centsToAmount(3500)).toBe("35.00");
    expect(centsToAmount(5)).toBe("0.05");
  });

  it("treats missing or unreadable prices as nothing, never NaN", () => {
    // A NaN reaching the invoice columns writes a broken row rather than
    // failing, and nobody notices until a client queries their bill.
    for (const bad of [null, undefined, "", "quote on request"]) {
      expect(toCents(bad as string)).toBe(0);
    }
  });

  it("adds up without float drift", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004. The real catalogue has
    // prices like 35.00 and 65.00, but a 0.05 rounding adjustment on an
    // invoice is enough to produce a figure nobody can reconcile.
    const total = appointmentTotal("0.10", [{ name: "x", unitPrice: "0.20" }]);
    expect(total).toBe("0.30");
    expect(appointmentTotal("99.99", [{ name: "a", unitPrice: "0.01" }])).toBe("100.00");
  });
});

describe("which add-ons need a price typed in", () => {
  it("asks for the quote-priced ones", () => {
    // Colour / Dye and Daycare are quoted per dog in the real catalogue.
    // Letting them through at $0 is work given away.
    expect(addOnRequiresManualPrice("quote")).toBe(true);
    expect(addOnRequiresManualPrice("range")).toBe(true);
    expect(addOnRequiresManualPrice("from")).toBe(true);
  });

  it("copies a fixed price without asking", () => {
    expect(addOnRequiresManualPrice("fixed")).toBe(false);
    expect(addOnRequiresManualPrice(null)).toBe(false);
  });
});

describe("the itemised invoice", () => {
  const base = { petName: "Link", serviceLabel: "Classic Groom", servicePrice: "95.00" };

  it("lists the groom first, then each add-on, with its own price", () => {
    const { lines, subtotal } = buildInvoiceLines({
      ...base,
      addOns: [
        { name: "Anal Glands", unitPrice: "35.00" },
        { name: "Teeth Ultra Clean", unitPrice: "65.00" },
      ],
    });
    expect(lines).toEqual([
      { description: "Link — Classic Groom", quantity: "1", unitPrice: "95.00", lineTotal: "95.00" },
      { description: "Link — Anal Glands", quantity: "1", unitPrice: "35.00", lineTotal: "35.00" },
      { description: "Link — Teeth Ultra Clean", quantity: "1", unitPrice: "65.00", lineTotal: "65.00" },
    ]);
    expect(subtotal).toBe("195.00");
  });

  it("multiplies a quantity into the line total", () => {
    // Pick up AND delivery is the same add-on twice, at $25 each way.
    const { lines, subtotal } = buildInvoiceLines({
      ...base, servicePrice: "95.00",
      addOns: [{ name: "Pick Up or Delivery (each way)", unitPrice: "25.00", quantity: 2 }],
    });
    expect(lines[1]).toEqual({
      description: "Link — Pick Up or Delivery (each way)", quantity: "2", unitPrice: "25.00", lineTotal: "50.00",
    });
    expect(subtotal).toBe("145.00");
  });

  it("tells two dogs' add-ons apart on one bill", () => {
    // The case this exists for. Lauren bills a two-dog booking as one
    // invoice, and both dogs often have the same extra. Unattributed,
    // the client gets two lines both reading "Teeth Brushing" and no way
    // to see that each dog was charged once rather than one dog twice.
    const pippin = buildInvoiceLines({
      petName: "Pippin", serviceLabel: "Classic Groom", servicePrice: "145.00",
      addOns: [{ name: "Teeth Brushing", unitPrice: "35.00" }],
    });
    const mabel = buildInvoiceLines({
      petName: "Mabel", serviceLabel: "Classic Groom", servicePrice: "163.00",
      addOns: [{ name: "Teeth Brushing", unitPrice: "35.00" }],
    });
    const descriptions = [...pippin.lines, ...mabel.lines].map((l) => l.description);
    expect(descriptions).toEqual([
      "Pippin — Classic Groom", "Pippin — Teeth Brushing",
      "Mabel — Classic Groom", "Mabel — Teeth Brushing",
    ]);
    // Every line names a dog, so no line is ambiguous on a combined bill.
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("still shows an add-on that was never priced", () => {
    // It was done to the dog. An invoice that omits it disagrees with the
    // grooming card, which is worse than a zero.
    const { lines, subtotal } = buildInvoiceLines({
      ...base, addOns: [{ name: "Colour / Dye", unitPrice: null as unknown as string }],
    });
    expect(lines).toHaveLength(2);
    expect(lines[1].lineTotal).toBe("0.00");
    expect(subtotal).toBe("95.00");
  });

  it("produces a single groom line when there are no add-ons, as before", () => {
    const { lines, subtotal } = buildInvoiceLines({ ...base, addOns: [] });
    expect(lines).toHaveLength(1);
    expect(subtotal).toBe("95.00");
  });

  it("names the pet, falling back rather than printing undefined", () => {
    expect(buildInvoiceLines({ ...base, petName: null, addOns: [] }).lines[0].description)
      .toBe("Pet — Classic Groom");
    expect(buildInvoiceLines({ ...base, petName: "   ", addOns: [] }).lines[0].description)
      .toBe("Pet — Classic Groom");
  });

  it("handles an appointment with no price but real add-ons", () => {
    // Membership grooms carry no price by design. If an add-on is done on
    // one, the extras are genuinely billable even though the groom is not.
    const { lines, subtotal } = buildInvoiceLines({
      ...base, servicePrice: null,
      addOns: [{ name: "Teeth Brushing", unitPrice: "35.00" }],
    });
    expect(lines[0].lineTotal).toBe("0.00");
    expect(subtotal).toBe("35.00");
  });

  it("sums the extras on their own", () => {
    expect(addOnsTotal([
      { name: "a", unitPrice: "35.00" },
      { name: "b", unitPrice: "25.00", quantity: 2 },
    ])).toBe("85.00");
    expect(addOnsTotal([])).toBe("0.00");
  });

  it("refuses a nonsense quantity rather than inverting the bill", () => {
    expect(addOnsTotal([{ name: "a", unitPrice: "35.00", quantity: 0 }])).toBe("35.00");
    expect(addOnsTotal([{ name: "a", unitPrice: "35.00", quantity: -3 }])).toBe("35.00");
  });
});

describe("what is actually owed on an appointment", () => {
  it("adds the extras to the groom", () => {
    // Lauren, 07/10/2026, on Millie: "$145 for the groom $35 for the extra
    // care". The panel was showing $145 owing.
    expect(billableTotal("145.00", [{ name: "Extra Care", unitPrice: "35.00", quantity: 1 }]))
      .toBe("180.00");
  });

  it("counts quantity", () => {
    expect(billableTotal("145.00", [{ name: "Nail trim", unitPrice: "15.00", quantity: 3 }]))
      .toBe("190.00");
  });

  it("is just the price when nothing was added", () => {
    expect(billableTotal("145.00", [])).toBe("145.00");
  });

  it("keeps 'nobody has priced this' distinct from 'it is free'", () => {
    // A null total is what stops the panel calling an unpriced booking
    // settled. Most imported history has no price at all.
    expect(billableTotal(null, [])).toBeNull();
    expect(billableTotal(undefined, [])).toBeNull();
    expect(billableTotal("", [])).toBeNull();
    expect(billableTotal("0.00", [])).toBe("0.00");
  });

  it("bills the extras on a groom that carries no price", () => {
    // A membership groom has no price on purpose — the weekly payment
    // covers it — but the de-matt done on the day is covered by nothing.
    expect(billableTotal(null, [{ name: "De-matt", unitPrice: "65.00", quantity: 1 }]))
      .toBe("65.00");
  });

  it("adds up in cents, not floats", () => {
    expect(billableTotal("0.10", [{ name: "a", unitPrice: "0.20", quantity: 1 }])).toBe("0.30");
    expect(billableTotal("99.99", [
      { name: "a", unitPrice: "35.35", quantity: 3 },
      { name: "b", unitPrice: "10.10", quantity: 1 },
    ])).toBe("216.14");
  });
});

describe("a booking that covers several dogs", () => {
  it("puts each dog's extras on its own bill", () => {
    // The mistake worth a test: one flat list of add-ons for two
    // appointments, and the de-matt landing on the wrong dog's bill.
    const totals = billableTotalsByAppointment(
      [{ id: 10, price: "145.00" }, { id: 11, price: "95.00" }],
      [
        { appointmentId: 10, name: "Extra Care", unitPrice: "35.00", quantity: 1 },
        { appointmentId: 11, name: "Nail trim", unitPrice: "15.00", quantity: 2 },
      ],
    );
    expect(totals.get(10)).toBe("180.00");
    expect(totals.get(11)).toBe("125.00");
  });

  it("leaves a dog with no extras on its own price", () => {
    const totals = billableTotalsByAppointment(
      [{ id: 10, price: "145.00" }, { id: 11, price: "95.00" }],
      [{ appointmentId: 10, name: "Extra Care", unitPrice: "35.00", quantity: 1 }],
    );
    expect(totals.get(11)).toBe("95.00");
  });

  it("ignores add-ons belonging to an appointment outside the booking", () => {
    const totals = billableTotalsByAppointment(
      [{ id: 10, price: "145.00" }],
      [{ appointmentId: 999, name: "Someone else's", unitPrice: "500.00", quantity: 1 }],
    );
    expect(totals.get(10)).toBe("145.00");
  });

  it("keeps an unpriced dog unpriced, so it stays out of the booking total", () => {
    const totals = billableTotalsByAppointment(
      [{ id: 10, price: "145.00" }, { id: 11, price: null }],
      [],
    );
    expect(totals.get(10)).toBe("145.00");
    expect(totals.get(11)).toBeNull();
  });
});

describe("the invoice a membership client gets for extras", () => {
  const addOns = [{ name: "De-matt", unitPrice: "65.00", quantity: 1 }];

  it("charges the extras and not the groom", () => {
    const itemised = buildInvoiceLines({
      petName: "Millie", serviceLabel: "Styled Groom", servicePrice: null,
      addOns, membershipCovered: true,
    });
    expect(itemised.subtotal).toBe("65.00");
  });

  it("still shows the groom, so a $65 bill makes sense to the client", () => {
    // An invoice listing a de-matt and nothing else reads like a mistake.
    const itemised = buildInvoiceLines({
      petName: "Millie", serviceLabel: "Styled Groom", servicePrice: null,
      addOns, membershipCovered: true,
    });
    expect(itemised.lines[0]).toEqual({
      description: "Millie — Styled Groom (covered by membership)",
      quantity: "1",
      unitPrice: "0.00",
      lineTotal: "0.00",
    });
    expect(itemised.lines[1].description).toBe("Millie — De-matt");
  });

  it("refuses to bill the groom even when the appointment carries a price", () => {
    // The double-charge guard. A membership groom should have no price; if
    // one ever does, the client must not pay weekly AND be invoiced for it.
    const itemised = buildInvoiceLines({
      petName: "Millie", serviceLabel: "Styled Groom", servicePrice: "290.00",
      addOns, membershipCovered: true,
    });
    expect(itemised.subtotal).toBe("65.00");
    expect(itemised.lines[0].lineTotal).toBe("0.00");
  });

  it("leaves an ordinary groom billed in full", () => {
    const itemised = buildInvoiceLines({
      petName: "Millie", serviceLabel: "Styled Groom", servicePrice: "145.00", addOns,
    });
    expect(itemised.subtotal).toBe("210.00");
    expect(itemised.lines[0].description).toBe("Millie — Styled Groom");
    expect(itemised.lines[0].lineTotal).toBe("145.00");
  });
});

describe("billableTotal with a manual override", () => {
  it("replaces the computed figure outright", () => {
    // Andy, 13/10: "This is thr wrong price - manual overide always needed."
    // The override is what the dog is charged, not an adjustment to it.
    expect(billableTotal("110.00", [{ name: "Teeth Ultra Clean", unitPrice: "65.00" }])).toBe("175.00");
    expect(billableTotal("110.00", [{ name: "Teeth Ultra Clean", unitPrice: "65.00" }], "150.00")).toBe("150.00");
  });

  it("keeps a zero override, because that is a decision somebody made", () => {
    // "This one is on us" must not be mistaken for a missing value.
    expect(billableTotal("110.00", [], 0)).toBe("0.00");
    expect(billableTotal("110.00", [], "0.00")).toBe("0.00");
    expect(isUsableBilledOverride(0)).toBe(true);
  });

  it("prices an otherwise unpriced dog", () => {
    // Without an override this is null — nobody has priced it. With one,
    // somebody has.
    expect(billableTotal(null, [])).toBeNull();
    expect(billableTotal(null, [], "90.00")).toBe("90.00");
  });

  it("ignores a figure that is not usable rather than storing nonsense", () => {
    const addOns = [{ name: "Teeth Ultra Clean", unitPrice: "65.00" }];
    expect(billableTotal("110.00", addOns, null)).toBe("175.00");
    expect(billableTotal("110.00", addOns, "")).toBe("175.00");
    expect(billableTotal("110.00", addOns, "abc")).toBe("175.00");
    // A negative bill is a typo, not a refund; it must never become money
    // owed back to a client.
    expect(billableTotal("110.00", addOns, "-50")).toBe("175.00");
    expect(isUsableBilledOverride("-50")).toBe(false);
  });

  it("rounds to cents rather than carrying a float", () => {
    expect(billableTotal(null, [], 150.005)).toBe("150.01");
    expect(billableTotal(null, [], "99.999")).toBe("100.00");
  });

  it("overrides one dog of a booking without touching its sibling", () => {
    // Louie and Lollie, 13/10: both $110 with their own $65 teeth clean,
    // so $175 each is correct. Overriding one must leave the other alone.
    const totals = billableTotalsByAppointment(
      [
        { id: 1200134, price: "110.00", billedTotalOverride: "150.00" },
        { id: 2130003, price: "110.00" },
      ],
      [
        { appointmentId: 1200134, name: "Teeth Ultra Clean", unitPrice: "65.00" },
        { appointmentId: 2130003, name: "Teeth Ultra Clean", unitPrice: "65.00" },
      ],
    );
    expect(totals.get(1200134)).toBe("150.00");
    expect(totals.get(2130003)).toBe("175.00");
  });
});

describe("a discount on an add-on line", () => {
  const base = { petName: "Boo", serviceLabel: "Classic Groom", servicePrice: "110.00" };

  it("shows the full rate and takes the discount off on its own line", () => {
    // Folding it into the unit price would read as though the salon's
    // prices changed. The client should see $35 and what came off it.
    const { lines, subtotal } = buildInvoiceLines({
      ...base,
      addOns: [{ name: "Teeth Clean", unitPrice: "35.00", discountAmount: "5.00", discountReason: "regular" }],
    });
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ description: "Boo — Teeth Clean", lineTotal: "35.00" });
    expect(lines[2]).toMatchObject({ description: "Boo — Teeth Clean: $5.00 off (regular)", lineTotal: "-5.00" });
    expect(subtotal).toBe("140.00"); // 110 + 35 - 5
  });

  it("takes a percentage off the line AFTER quantity", () => {
    // Two teeth cleans at 20% off is 20% off both, not off one.
    const { lines, subtotal } = buildInvoiceLines({
      ...base,
      addOns: [{ name: "Teeth Clean", unitPrice: "35.00", quantity: 2, discountPercent: 20, discountReason: "two dogs" }],
    });
    expect(lines[1]).toMatchObject({ quantity: "2", lineTotal: "70.00" });
    expect(lines[2]).toMatchObject({ lineTotal: "-14.00" });
    expect(subtotal).toBe("166.00"); // 110 + 70 - 14
  });

  it("never discounts a line below zero", () => {
    const { subtotal } = buildInvoiceLines({
      ...base, servicePrice: "0.00",
      addOns: [{ name: "Nail Trim", unitPrice: "15.00", discountAmount: "50.00", discountReason: "goodwill" }],
    });
    expect(subtotal).toBe("0.00");
  });

  it("charges full price when both discount columns are set", () => {
    // Impossible through the UI; if a row has both, picking one is a
    // surprise to whoever agreed the other.
    const { subtotal } = buildInvoiceLines({
      ...base,
      addOns: [{ name: "Teeth Clean", unitPrice: "35.00", discountPercent: 20, discountAmount: "5.00" }],
    });
    expect(subtotal).toBe("145.00");
  });

  it("leaves an undiscounted add-on exactly as it was", () => {
    const { lines, subtotal } = buildInvoiceLines({
      ...base, addOns: [{ name: "Teeth Clean", unitPrice: "35.00" }],
    });
    expect(lines).toHaveLength(2);
    expect(subtotal).toBe("145.00");
  });
});

describe("addOnsTotal nets off discounts", () => {
  it("sums what is owed, not the full rate", () => {
    // This figure feeds decideAppointmentInvoice and the payment panel's
    // "owing", so summing gross would have the counter asking a client
    // for money that was discounted off.
    expect(addOnsTotal([
      { name: "Teeth Clean", unitPrice: "35.00", discountAmount: "5.00" },
      { name: "Nail Trim", unitPrice: "15.00" },
    ])).toBe("45.00");
  });

  it("is unchanged when nothing is discounted", () => {
    expect(addOnsTotal([{ name: "Teeth Clean", unitPrice: "35.00", quantity: 2 }])).toBe("70.00");
  });
});

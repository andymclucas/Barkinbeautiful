import { describe, expect, it } from "vitest";
import {
  toCents, centsToAmount, addOnRequiresManualPrice,
  buildInvoiceLines, appointmentTotal, addOnsTotal,
} from "@shared/appointmentAddOns";

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
      { description: "Anal Glands", quantity: "1", unitPrice: "35.00", lineTotal: "35.00" },
      { description: "Teeth Ultra Clean", quantity: "1", unitPrice: "65.00", lineTotal: "65.00" },
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
      description: "Pick Up or Delivery (each way)", quantity: "2", unitPrice: "25.00", lineTotal: "50.00",
    });
    expect(subtotal).toBe("145.00");
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

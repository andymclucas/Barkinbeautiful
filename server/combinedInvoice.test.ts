import { describe, it, expect } from "vitest";
import { combineInvoice, listPets, combinedInvoiceNumber } from "../shared/combinedInvoice";

const line = (description: string, cents: number) => ({
  description, quantity: "1", unitPrice: (cents / 100).toFixed(2), lineTotal: (cents / 100).toFixed(2),
});

/** Lauren's booking: Agnes and Shirley, $110 groom + $35 extras each. */
const AGNES = {
  appointmentId: 1, petName: "Agnes", membershipCovered: false, subtotalCents: 14500,
  lines: [line("Agnes — Classic Groom", 11000), line("Agnes — Anal Glands", 3500)],
};
const SHIRLEY = {
  appointmentId: 2, petName: "Shirley", membershipCovered: false, subtotalCents: 14500,
  lines: [line("Shirley — Classic Groom", 11000), line("Shirley — Anal Glands", 3500)],
};

describe("combineInvoice", () => {
  it("makes one bill for the whole booking", () => {
    const out = combineInvoice([AGNES, SHIRLEY])!;
    expect(out.subtotal).toBe("290.00");
    expect(out.appointmentIds).toEqual([1, 2]);
    expect(out.who).toBe("Agnes and Shirley");
  });

  it("keeps every dog's lines, in booking order", () => {
    const out = combineInvoice([AGNES, SHIRLEY])!;
    expect(out.lines.map((l) => l.description)).toEqual([
      "Agnes — Classic Groom", "Agnes — Anal Glands",
      "Shirley — Classic Groom", "Shirley — Anal Glands",
    ]);
  });

  it("bills a member and a non-member exactly as two invoices would", () => {
    // Agnes is covered, so her groom is already a zero line; only her
    // extras are chargeable. Shirley pays in full.
    const coveredAgnes = {
      ...AGNES, membershipCovered: true, subtotalCents: 3500,
      lines: [line("Agnes — Classic Groom (membership)", 0), line("Agnes — Anal Glands", 3500)],
    };
    const out = combineInvoice([coveredAgnes, SHIRLEY])!;
    expect(out.subtotal).toBe("180.00");
    expect(out.lines).toHaveLength(4);
  });

  it("raises nothing when the whole booking is membership-covered", () => {
    // A $0 invoice is a bill the client has to read and ignore.
    const covered = (id: number, name: string) => ({
      appointmentId: id, petName: name, membershipCovered: true, subtotalCents: 0,
      lines: [line(`${name} — Classic Groom (membership)`, 0)],
    });
    expect(combineInvoice([covered(1, "Agnes"), covered(2, "Shirley")])).toBeNull();
  });

  it("raises nothing when there is nothing to bill at all", () => {
    expect(combineInvoice([])).toBeNull();
    expect(combineInvoice([{ ...AGNES, lines: [], subtotalCents: 0 }])).toBeNull();
  });

  it("works for a single dog, so one path serves both", () => {
    const out = combineInvoice([AGNES])!;
    expect(out.subtotal).toBe("145.00");
    expect(out.who).toBe("Agnes");
    expect(out.appointmentIds).toEqual([1]);
  });

  it("skips a dog with no lines rather than billing an empty row", () => {
    const out = combineInvoice([AGNES, { ...SHIRLEY, lines: [], subtotalCents: 0 }])!;
    expect(out.appointmentIds).toEqual([1]);
    expect(out.who).toBe("Agnes");
  });

  it("adds cents without a floating-point drift", () => {
    const a = { ...AGNES, subtotalCents: 3333, lines: [line("a", 3333)] };
    const b = { ...SHIRLEY, subtotalCents: 3334, lines: [line("b", 3334)] };
    expect(combineInvoice([a, b])!.subtotal).toBe("66.67");
  });
});

describe("listPets", () => {
  it("reads as a sentence", () => {
    expect(listPets(["Agnes"])).toBe("Agnes");
    expect(listPets(["Agnes", "Shirley"])).toBe("Agnes and Shirley");
    expect(listPets(["Agnes", "Shirley", "Bo"])).toBe("Agnes, Shirley and Bo");
  });

  it("never renders blank", () => {
    expect(listPets([])).toBe("Pet");
    expect(listPets([null, "  "])).toBe("Pet");
  });
});

describe("combinedInvoiceNumber", () => {
  const date = new Date("2026-10-23T00:00:00Z");

  it("names the household, not one of the dogs", () => {
    // Naming a two-dog bill after one dog makes the other owner's copy
    // look like somebody else's invoice.
    expect(combinedInvoiceNumber({ clientLastName: "Gerard", date, suffix: "A1B2" }))
      .toBe("GROOM-GERARD-231026-A1B2");
  });

  it("copes with punctuation and spaces in a surname", () => {
    expect(combinedInvoiceNumber({ clientLastName: "O'Brien-Smith", date, suffix: "X9" }))
      .toMatch(/^GROOM-O-BRIEN-231026-X9$/);
  });

  it("falls back rather than producing GROOM--231026", () => {
    for (const bad of [null, undefined, "", "   ", "!!!"]) {
      expect(combinedInvoiceNumber({ clientLastName: bad, date, suffix: "Z" }))
        .toBe("GROOM-CLIENT-231026-Z");
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  applyLineDiscount, validateLineDiscount, describeLineDiscount, discountFromColumns,
} from "../shared/lineDiscount";

describe("applyLineDiscount", () => {
  it("takes a percentage off", () => {
    expect(applyLineDiscount("35.00", { kind: "percent", value: 20 }))
      .toMatchObject({ grossCents: 3500, discountCents: 700, netCents: 2800 });
  });

  it("takes a flat dollar figure off — the thing Andy asked for", () => {
    expect(applyLineDiscount("35.00", { kind: "amount", value: 5 }))
      .toMatchObject({ grossCents: 3500, discountCents: 500, netCents: 3000 });
  });

  it("rounds the DISCOUNT, so gross minus discount always reconciles", () => {
    // 15% of $47.50 is 7.125. Rounding the net instead can leave
    // gross - net different from the figure said out loud.
    const b = applyLineDiscount("47.50", { kind: "percent", value: 15 });
    expect(b.discountCents).toBe(713);
    expect(b.grossCents - b.discountCents).toBe(b.netCents);
  });

  it("never takes off more than the line costs", () => {
    // $20 off a $15 add-on settles at $15, not at minus five — a
    // negative line would quietly turn an invoice into a refund.
    expect(applyLineDiscount("15.00", { kind: "amount", value: 20 }))
      .toMatchObject({ discountCents: 1500, netCents: 0 });
    expect(applyLineDiscount("15.00", { kind: "percent", value: 150 }))
      .toMatchObject({ discountCents: 1500, netCents: 0 });
  });

  it("leaves a line alone when there is no discount", () => {
    expect(applyLineDiscount("35.00", null)).toMatchObject({ discountCents: 0, netCents: 3500 });
    expect(applyLineDiscount(null, { kind: "amount", value: 5 }))
      .toMatchObject({ grossCents: 0, discountCents: 0, netCents: 0 });
  });
});

describe("validateLineDiscount", () => {
  const reason = "long-standing client";

  it("accepts either shape", () => {
    expect(validateLineDiscount({ kind: "percent", value: 20, reason }))
      .toEqual({ ok: true, discount: { kind: "percent", value: 20 }, reason });
    expect(validateLineDiscount({ kind: "amount", value: "5.00", reason, gross: 35 }))
      .toEqual({ ok: true, discount: { kind: "amount", value: 5 }, reason });
  });

  it("still demands a reason", () => {
    // Money comes off the bill and nobody can say why a month later.
    expect(validateLineDiscount({ kind: "percent", value: 20, reason: "  " }))
      .toEqual({ ok: false, error: "Please say why this discount is being applied." });
  });

  it("catches a dollar discount bigger than the line, as it is typed", () => {
    expect(validateLineDiscount({ kind: "amount", value: 50, reason, gross: 35 }))
      .toEqual({ ok: false, error: "That is more than the $35.00 on this line." });
  });

  it("refuses more than 100% and anything at or below zero", () => {
    expect(validateLineDiscount({ kind: "percent", value: 150, reason }).ok).toBe(false);
    for (const v of [0, -5]) {
      expect(validateLineDiscount({ kind: "amount", value: v, reason, gross: 35 }).ok).toBe(false);
    }
  });

  it("clears cleanly, dropping the reason with it", () => {
    for (const empty of [null, undefined, ""]) {
      expect(validateLineDiscount({ kind: null, value: empty, reason }))
        .toEqual({ ok: true, discount: null, reason: null });
    }
  });

  it("copes with a typed $ or % sign", () => {
    expect(validateLineDiscount({ kind: "amount", value: "$5", reason, gross: 35 }))
      .toMatchObject({ ok: true, discount: { kind: "amount", value: 5 } });
    expect(validateLineDiscount({ kind: "percent", value: "20%", reason }))
      .toMatchObject({ ok: true, discount: { kind: "percent", value: 20 } });
  });

  it("is not restricted to 5/10/15/20 the way the groom discount is", () => {
    // Andy asked for a manually entered figure, so any sane value goes.
    expect(validateLineDiscount({ kind: "percent", value: 12.5, reason }))
      .toMatchObject({ ok: true, discount: { kind: "percent", value: 12.5 } });
  });
});

describe("discountFromColumns", () => {
  it("reads whichever column is set", () => {
    expect(discountFromColumns(20, null)).toEqual({ kind: "percent", value: 20 });
    expect(discountFromColumns(null, "5.00")).toEqual({ kind: "amount", value: 5 });
    expect(discountFromColumns(null, null)).toBeNull();
  });

  it("charges full when BOTH are set, rather than guessing", () => {
    // Both should be impossible. If a row has them, something else wrote
    // it, and picking one is a surprise to whoever agreed the other.
    expect(discountFromColumns(20, "5.00")).toBeNull();
  });

  it("treats zero as unset", () => {
    expect(discountFromColumns(0, "0.00")).toBeNull();
  });
});

describe("describeLineDiscount", () => {
  it("reads as a label beside the line", () => {
    expect(describeLineDiscount({ kind: "percent", value: 20 }, 700)).toBe("20% off ($7.00)");
    expect(describeLineDiscount({ kind: "amount", value: 5 })).toBe("$5.00 off");
    expect(describeLineDiscount(null)).toBeNull();
  });
});

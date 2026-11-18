import { describe, expect, it } from "vitest";
import { markOutButton } from "./markOutButton";

describe("markOutButton", () => {
  it("says payment is pending while anything is owing", () => {
    expect(markOutButton(145)).toEqual({ label: "OUT (payment pending)", pending: true });
    expect(markOutButton(0.01)).toEqual({ label: "OUT (payment pending)", pending: true });
  });

  it("says paid once nothing is owing, including an overpayment", () => {
    expect(markOutButton(0)).toEqual({ label: "Paid & OUT", pending: false });
    expect(markOutButton(-20)).toEqual({ label: "Paid & OUT", pending: false });
  });

  it("does not say paid for a groom that was priced at nothing", () => {
    expect(markOutButton(0, 0)).toEqual({ label: "OUT", pending: false });
    // Priced, and settled: that one really was paid.
    expect(markOutButton(0, 145)).toEqual({ label: "Paid & OUT", pending: false });
    // Nil groom with extras still owing.
    expect(markOutButton(20, 20)).toEqual({ label: "OUT (payment pending)", pending: true });
  });

  it("does not call a rounding crumb a debt", () => {
    expect(markOutButton(0.004)).toEqual({ label: "Paid & OUT", pending: false });
  });

  it("claims neither while the figure is unknown or the booking has no price", () => {
    expect(markOutButton(null)).toEqual({ label: "OUT", pending: false });
    expect(markOutButton(undefined)).toEqual({ label: "OUT", pending: false });
    expect(markOutButton(Number.NaN)).toEqual({ label: "OUT", pending: false });
  });
});

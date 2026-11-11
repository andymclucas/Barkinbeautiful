import { describe, expect, it } from "vitest";
import { checkPortalPayment, portalPayMaxCents, splitArrivedPayment, todaysBillReady } from "./portalAppointmentPay";

describe("paying today's appointment in the portal", () => {
  it("pays the bill and puts the rest on account (Andy's 300 / 500 example)", () => {
    expect(checkPortalPayment({ owedCents: 30000, amountCents: 50000 })).toEqual({ ok: true, toBookingCents: 30000, toCreditCents: 20000 });
  });
  it("takes exactly the bill with nothing to credit", () => {
    expect(checkPortalPayment({ owedCents: 11000, amountCents: 11000 })).toEqual({ ok: true, toBookingCents: 11000, toCreditCents: 0 });
  });
  it("refuses less than the bill", () => {
    expect(checkPortalPayment({ owedCents: 11000, amountCents: 5000 }).ok).toBe(false);
  });
  it("refuses more than the cap, unless the bill itself is bigger", () => {
    expect(checkPortalPayment({ owedCents: 11000, amountCents: 100001 }).ok).toBe(false);
    expect(portalPayMaxCents(150000)).toBe(150000);
    expect(checkPortalPayment({ owedCents: 150000, amountCents: 150000 }).ok).toBe(true);
  });
  it("refuses when nothing is owing", () => {
    expect(checkPortalPayment({ owedCents: 0, amountCents: 5000 }).ok).toBe(false);
  });
});

describe("where arrived money goes", () => {
  it("covers what is still owing and credits the rest", () => {
    expect(splitArrivedPayment(50000, 30000)).toEqual({ toBookingCents: 30000, toCreditCents: 20000 });
  });
  it("credits all of it when the bill was already paid at the counter", () => {
    expect(splitArrivedPayment(30000, 0)).toEqual({ toBookingCents: 0, toCreditCents: 30000 });
  });
});

describe("is today's bill ready to pay", () => {
  it("is ready when every dog is priced", () => {
    expect(todaysBillReady([{ total: "145.00", coveredByMembership: false, owedCents: 14500 }])).toBe(true);
  });
  it("lets a membership dog with no figure through, since it owes nothing", () => {
    expect(todaysBillReady([
      { total: "60.00", coveredByMembership: false, owedCents: 6000 },
      { total: null, coveredByMembership: true, owedCents: 0 },
    ])).toBe(true);
  });
  it("is not ready while a casual groom has no price yet", () => {
    expect(todaysBillReady([{ total: null, coveredByMembership: false, owedCents: 0 }])).toBe(false);
  });
  it("is not ready with no booking today", () => {
    expect(todaysBillReady([])).toBe(false);
  });
});

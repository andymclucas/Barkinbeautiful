import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { tenantIdForCalledNumber, tenantIdForWebhook, forgetNumberTenant } from "./tenantByNumber";

function tenantsTable(rows: Array<{ id: number; number: string | null }>) {
  const chain: any = {
    from: () => chain, where: () => chain, limit: () => Promise.resolve(rows),
    then: (res: (v: unknown[]) => unknown, rej?: (r: unknown) => unknown) => Promise.resolve(rows).then(res, rej),
  };
  return { select: vi.fn(() => chain) };
}

beforeEach(() => { forgetNumberTenant(); getDb.mockReset(); });

describe("which salon a Twilio webhook is about", () => {
  it("matches the number that was called", async () => {
    getDb.mockResolvedValue(tenantsTable([
      { id: 1, number: "+61400111222" },
      { id: 2, number: "+61400333444" },
    ]));
    expect(await tenantIdForCalledNumber("+61400333444")).toBe(2);
  });

  it("matches however the number happens to be written", async () => {
    // A hand-entered number might be 0400... while Twilio always sends
    // E.164. Comparing raw strings would route the message nowhere.
    getDb.mockResolvedValue(tenantsTable([{ id: 7, number: "0400111222" }]));
    expect(await tenantIdForCalledNumber("+61400111222")).toBe(7);
    forgetNumberTenant();
    getDb.mockResolvedValue(tenantsTable([{ id: 7, number: "+61 400 111 222" }]));
    expect(await tenantIdForCalledNumber("+61400111222")).toBe(7);
  });

  it("returns null for a number no salon claims", async () => {
    // NOT tenant 1. Silently filing a stranger's message under the first
    // salon is the bug this exists to remove.
    getDb.mockResolvedValue(tenantsTable([{ id: 1, number: "+61400111222" }]));
    expect(await tenantIdForCalledNumber("+61499999999")).toBeNull();
    expect(await tenantIdForCalledNumber(null)).toBeNull();
  });

  it("ignores salons with no number at all", async () => {
    getDb.mockResolvedValue(tenantsTable([{ id: 1, number: null }, { id: 2, number: "+61400111222" }]));
    expect(await tenantIdForCalledNumber("+61400111222")).toBe(2);
  });
});

describe("what a webhook does when the number is unrecognised", () => {
  it("falls back to tenant 1 rather than dropping the message", async () => {
    // One salon exists, so this is right today. It is logged as a warning
    // because the moment there are two, it is a message about to be filed
    // under the wrong business.
    getDb.mockResolvedValue(tenantsTable([{ id: 1, number: "+61400111222" }]));
    expect(await tenantIdForWebhook("+61499999999")).toBe(1);
    expect(await tenantIdForWebhook(undefined)).toBe(1);
  });

  it("uses the real salon when the number IS recognised", async () => {
    getDb.mockResolvedValue(tenantsTable([{ id: 9, number: "+61400111222" }]));
    expect(await tenantIdForWebhook("+61400111222")).toBe(9);
  });

  it("survives the database being unavailable", async () => {
    getDb.mockResolvedValue(null);
    expect(await tenantIdForWebhook("+61400111222")).toBe(1);
  });
});

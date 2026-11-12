import { describe, expect, it } from "vitest";
import { emailEventEffect, rateOf, type CampaignSendState } from "./emailEventEffect";

const at = new Date("2026-11-12T03:00:00Z");
const fresh: CampaignSendState = { openedAt: null, clickedAt: null, status: "sent" };

describe("what a Resend event does to a campaign send", () => {
  it("counts the first open, once", () => {
    expect(emailEventEffect(fresh, "email.opened", at)).toEqual({ patch: { openedAt: at }, opened: 1, clicked: 0 });
    expect(emailEventEffect({ ...fresh, openedAt: at }, "email.opened", at)).toEqual({ patch: {}, opened: 0, clicked: 0 });
  });

  it("counts a click as an open too when no open was seen — tracking images get blocked", () => {
    expect(emailEventEffect(fresh, "email.clicked", at)).toEqual({ patch: { clickedAt: at, openedAt: at }, opened: 1, clicked: 1 });
  });

  it("does not count the open twice when the client had already opened it", () => {
    const opened = { ...fresh, openedAt: new Date("2026-11-12T02:00:00Z") };
    expect(emailEventEffect(opened, "email.clicked", at)).toEqual({ patch: { clickedAt: at }, opened: 0, clicked: 1 });
  });

  it("counts the first click, once", () => {
    expect(emailEventEffect({ ...fresh, openedAt: at, clickedAt: at }, "email.clicked", at).clicked).toBe(0);
  });

  it("marks a bounce, once, and counts nothing for it", () => {
    expect(emailEventEffect(fresh, "email.bounced", at)).toEqual({ patch: { status: "bounced" }, opened: 0, clicked: 0 });
    expect(emailEventEffect({ ...fresh, status: "bounced" }, "email.bounced", at).patch).toEqual({});
  });

  it("ignores every other event", () => {
    for (const type of ["email.sent", "email.delivered", "email.complained", "contact.created", ""]) {
      expect(emailEventEffect(fresh, type, at)).toEqual({ patch: {}, opened: 0, clicked: 0 });
    }
  });
});

describe("rateOf", () => {
  it("is a whole percentage of what was sent", () => {
    expect(rateOf(3, 8)).toBe("38%");
    expect(rateOf(0, 5)).toBe("0%");
    expect(rateOf(null, 4)).toBe("0%");
  });
  it("shows a dash before anything has gone", () => {
    expect(rateOf(0, 0)).toBe("—");
    expect(rateOf(2, null)).toBe("—");
  });
});

import { describe, it, expect } from "vitest";
import {
  AFTERNOON_FROM_MINUTE, MAX_WAITLIST_WINDOW_DAYS, WAITLIST_OFFER_TTL_HOURS,
  createWaitlistToken, describeWindow, hashWaitlistToken, matchesSlot, offerState,
  rankMatches, waitlistOfferSmsCost, waitlistOfferUrl, windowLengthDays,
} from "@shared/waitlist";
import { PRODUCTION_APP_URL } from "@shared/const";

const entry = {
  preferredStaffId: 3,
  earliestDate: "2026-11-01",
  latestDate: "2026-11-30",
  timeOfDay: "any" as const,
};
/** 10:00 with Charlotte, mid-window. */
const slot = { staffId: 3, dateKey: "2026-11-12", startMinutes: 600 };

describe("matchesSlot", () => {
  it("matches inside the window and flags the groomer they asked for", () => {
    expect(matchesSlot(entry, slot)).toEqual({ matches: true, exactGroomer: true });
  });

  it("is inclusive at both ends of the window", () => {
    // "1st to the 30th" means both days. An exclusive end quietly drops
    // the last day of every window a client ever gives.
    expect(matchesSlot(entry, { ...slot, dateKey: "2026-11-01" }).matches).toBe(true);
    expect(matchesSlot(entry, { ...slot, dateKey: "2026-11-30" }).matches).toBe(true);
    expect(matchesSlot(entry, { ...slot, dateKey: "2026-10-31" })).toMatchObject({ matches: false, reason: "outside_window" });
    expect(matchesSlot(entry, { ...slot, dateKey: "2026-12-01" })).toMatchObject({ matches: false, reason: "outside_window" });
  });

  it("still matches a different groomer, but says it is not the one asked for", () => {
    // A preference, not a filter: the client may well take Megs on the
    // right day, and that is staff's call rather than the code's.
    expect(matchesSlot(entry, { ...slot, staffId: 2 })).toEqual({ matches: true, exactGroomer: false });
    expect(matchesSlot({ ...entry, preferredStaffId: null }, slot)).toEqual({ matches: true, exactGroomer: false });
  });

  it("honours mornings and afternoons at noon exactly", () => {
    const morning = { ...entry, timeOfDay: "morning" as const };
    const afternoon = { ...entry, timeOfDay: "afternoon" as const };
    expect(matchesSlot(morning, { ...slot, startMinutes: AFTERNOON_FROM_MINUTE - 1 }).matches).toBe(true);
    expect(matchesSlot(morning, { ...slot, startMinutes: AFTERNOON_FROM_MINUTE })).toMatchObject({ matches: false, reason: "wrong_time" });
    expect(matchesSlot(afternoon, { ...slot, startMinutes: AFTERNOON_FROM_MINUTE }).matches).toBe(true);
    expect(matchesSlot(afternoon, { ...slot, startMinutes: AFTERNOON_FROM_MINUTE - 1 })).toMatchObject({ matches: false, reason: "wrong_time" });
  });

  it("only compares service when both sides name one", () => {
    expect(matchesSlot({ ...entry, serviceType: "classic_groom" }, { ...slot, serviceType: "bath_only" }))
      .toMatchObject({ matches: false, reason: "wrong_service" });
    expect(matchesSlot({ ...entry, serviceType: "classic_groom" }, { ...slot, serviceType: null }).matches).toBe(true);
    expect(matchesSlot({ ...entry, serviceType: null }, { ...slot, serviceType: "bath_only" }).matches).toBe(true);
  });
});

describe("rankMatches", () => {
  it("puts the requested groomer first, then whoever waited longest", () => {
    const ranked = rankMatches([
      { id: "newer-any", exactGroomer: false, createdAt: "2026-10-10" },
      { id: "older-any", exactGroomer: false, createdAt: "2026-09-01" },
      { id: "newer-exact", exactGroomer: true, createdAt: "2026-10-12" },
      { id: "older-exact", exactGroomer: true, createdAt: "2026-10-01" },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["older-exact", "newer-exact", "older-any", "newer-any"]);
  });

  it("does not reorder the caller's array", () => {
    const rows = [{ exactGroomer: false, createdAt: "2026-10-10" }, { exactGroomer: true, createdAt: "2026-10-11" }];
    rankMatches(rows);
    expect(rows[0].exactGroomer).toBe(false);
  });
});

describe("offerState", () => {
  const NOW = new Date("2026-10-16T09:00:00+10:00");
  const live = { status: "offered" as const, expiresAt: new Date(NOW.getTime() + 3_600_000) };

  it("lets a live offer be claimed", () => {
    expect(offerState(live, NOW)).toEqual({ ok: true });
  });

  it("says the slot has GONE, not that it expired, once somebody has it", () => {
    // Two different apologies. A client told "expired" for a slot that
    // was given away will ring up asking why they were too slow.
    for (const status of ["approved", "declined"] as const) {
      const s = offerState({ ...live, status }, NOW);
      expect(s).toMatchObject({ ok: false, reason: "taken" });
      if (!s.ok) expect(s.message).toContain("already been taken");
    }
  });

  it("tells a client who already tapped that it is with the salon", () => {
    const s = offerState({ ...live, status: "claimed" }, NOW);
    expect(s).toMatchObject({ ok: false, reason: "already_claimed" });
  });

  it("reassures an expired offer that they are still on the list", () => {
    const s = offerState({ ...live, expiresAt: new Date(NOW.getTime() - 1) }, NOW);
    expect(s).toMatchObject({ ok: false, reason: "expired" });
    if (!s.ok) expect(s.message).toContain("still on the waitlist");
  });

  it("fails closed on an unreadable expiry", () => {
    expect(offerState({ ...live, expiresAt: "nonsense" }, NOW)).toMatchObject({ ok: false, reason: "expired" });
  });
});

describe("the offer text", () => {
  const url = waitlistOfferUrl(PRODUCTION_APP_URL, "a".repeat(32));

  it("fits one segment, which is what each offer costs", () => {
    // One of these goes out per freed slot per client. Two segments
    // doubles the bill on the busiest thing the salon will send.
    const cost = waitlistOfferSmsCost({
      salonName: "Barkin Beautiful", petName: "Leo", whenLabel: "Wed 4 Nov, 9:30am", url,
    });
    expect(cost.segments).toBe(1);
    expect(cost.encoding).toBe("GSM-7");
  });

  it("still fits for a longer salon and dog name", () => {
    expect(waitlistOfferSmsCost({
      salonName: "Pawfection Grooming Studio", petName: "Bartholomew", whenLabel: "Thu 12 Nov, 2:30pm", url,
    }).segments).toBe(1);
  });
});

describe("tokens and windows", () => {
  it("mints a distinct 128-bit token and stores only its hash", () => {
    const a = createWaitlistToken();
    expect(a.token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.tokenHash).toBe(hashWaitlistToken(a.token));
    expect(new Set(Array.from({ length: 100 }, () => createWaitlistToken().token)).size).toBe(100);
  });

  it("expires an offer a day out", () => {
    const now = new Date("2026-10-16T09:00:00+10:00");
    expect(createWaitlistToken(now).expiresAt.getTime() - now.getTime())
      .toBe(WAITLIST_OFFER_TTL_HOURS * 3_600_000);
  });

  it("counts a window inclusively, and refuses a backwards one", () => {
    expect(windowLengthDays("2026-11-01", "2026-11-01")).toBe(1);
    expect(windowLengthDays("2026-11-01", "2026-11-30")).toBe(30);
    expect(windowLengthDays("2026-11-30", "2026-11-01")).toBe(0);
    expect(windowLengthDays("rubbish", "2026-11-01")).toBe(0);
    expect(MAX_WAITLIST_WINDOW_DAYS).toBe(120);
  });

  it("describes a window the way staff would say it", () => {
    expect(describeWindow({ earliestDate: "2026-11-01", latestDate: "2026-11-30", timeOfDay: "any" }))
      .toBe("1 Nov – 30 Nov");
    expect(describeWindow({ earliestDate: "2026-11-04", latestDate: "2026-11-04", timeOfDay: "morning" }))
      .toBe("4 Nov, mornings only");
  });
});

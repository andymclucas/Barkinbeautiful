import { describe, it, expect } from "vitest";
import {
  withinOnlineDailyCap, withinRealClipCapacity, onlineDailyCapacityVerdict,
} from "../shared/onlineBookingCapacity";

/**
 * The bug this exists to prevent: an online cap of 6 counting all 9 of a
 * groomer's phone bookings and reporting the day as full to the public.
 */
describe("the online daily cap counts only what the public booked", () => {
  it("lets a stranger book a day staff have already filled, up to the cap", () => {
    // Charlie's Tuesday: 9 dogs on the board, none of them booked online.
    expect(withinOnlineDailyCap({ onlineBookingsToday: 0, dailyLimit: 6 })).toBe(true);
  });

  it("stops the public at the cap, counting only their own bookings", () => {
    expect(withinOnlineDailyCap({ onlineBookingsToday: 5, dailyLimit: 6 })).toBe(true);
    expect(withinOnlineDailyCap({ onlineBookingsToday: 6, dailyLimit: 6 })).toBe(false);
    expect(withinOnlineDailyCap({ onlineBookingsToday: 7, dailyLimit: 6 })).toBe(false);
  });

  it("treats 0 as no cap, because that is what an empty box saves as", () => {
    expect(withinOnlineDailyCap({ onlineBookingsToday: 40, dailyLimit: 0 })).toBe(true);
    expect(withinOnlineDailyCap({ onlineBookingsToday: 40, dailyLimit: null })).toBe(true);
    expect(withinOnlineDailyCap({ onlineBookingsToday: 40, dailyLimit: undefined })).toBe(true);
  });
});

describe("real clip capacity counts every appointment, not just online ones", () => {
  const clip = "classic_groom";
  const tidy = "fft";

  it("refuses the ninth clip on Charlie's 8-dog day", () => {
    expect(withinRealClipCapacity({
      serviceTypesToday: Array(8).fill(clip),
      addingServiceType: clip,
      dailyClipCapacity: 8,
    })).toBe(false);
  });

  it("allows the eighth", () => {
    expect(withinRealClipCapacity({
      serviceTypesToday: Array(7).fill(clip),
      addingServiceType: clip,
      dailyClipCapacity: 8,
    })).toBe(true);
  });

  it("counts two tidies as one clip, per Lauren's rule of thumb", () => {
    // 7 clips + 2 tidies = 8. A ninth clip does not fit.
    expect(withinRealClipCapacity({
      serviceTypesToday: [...Array(7).fill(clip), tidy, tidy],
      addingServiceType: clip,
      dailyClipCapacity: 8,
    })).toBe(false);
    // 7 clips + 1 tidy = 7.5. One more tidy makes 8 exactly, which fits.
    expect(withinRealClipCapacity({
      serviceTypesToday: [...Array(7).fill(clip), tidy],
      addingServiceType: tidy,
      dailyClipCapacity: 8,
    })).toBe(true);
  });

  it("does not refuse when no capacity is recorded", () => {
    // An unset figure is unknown, not zero — refusing would close online
    // booking for every groomer whose number nobody has typed in yet.
    for (const cap of [null, undefined, 0]) {
      expect(withinRealClipCapacity({
        serviceTypesToday: Array(30).fill(clip),
        addingServiceType: clip,
        dailyClipCapacity: cap,
      })).toBe(true);
    }
  });

  it("ignores bathing and other non-clip work in the clip count", () => {
    expect(withinRealClipCapacity({
      serviceTypesToday: Array(20).fill("bath_only"),
      addingServiceType: clip,
      dailyClipCapacity: 8,
    })).toBe(true);
  });
});

describe("both limits must pass", () => {
  const clip = "classic_groom";
  const base = {
    onlineBookingsToday: 0,
    dailyLimit: 6,
    serviceTypesToday: [] as string[],
    addingServiceType: clip,
    dailyClipCapacity: 8,
  };

  it("passes an ordinary booking", () => {
    expect(onlineDailyCapacityVerdict(base)).toEqual({ available: true });
  });

  it("fails on the online cap alone", () => {
    const out = onlineDailyCapacityVerdict({ ...base, onlineBookingsToday: 6 });
    expect(out.available).toBe(false);
  });

  it("fails on real capacity alone, with the online cap nowhere near", () => {
    // Two online bookings out of six, but the groomer's day is already full
    // of phone bookings. This is the case the split would otherwise miss.
    const out = onlineDailyCapacityVerdict({
      ...base,
      onlineBookingsToday: 2,
      serviceTypesToday: Array(8).fill(clip),
    });
    expect(out.available).toBe(false);
  });

  it("gives the same reason either way, because the day is full either way", () => {
    const a = onlineDailyCapacityVerdict({ ...base, onlineBookingsToday: 6 });
    const b = onlineDailyCapacityVerdict({ ...base, serviceTypesToday: Array(8).fill(clip) });
    expect(a).toEqual(b);
    // And it must not name an internal limit to a stranger.
    expect((a as { reason: string }).reason).not.toMatch(/online|clip|limit/i);
  });
});

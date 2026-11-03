import { describe, expect, it } from "vitest";
import { smsOptOutUpdate } from "../shared/smsOptOut";

const NOW = new Date("2026-11-03T05:00:00Z");
const OCTOBER = new Date("2026-10-12T01:30:00Z");

describe("smsOptOutUpdate", () => {
  it("stamps the time when a client is opted out", () => {
    expect(smsOptOutUpdate({ requested: true, current: null, now: NOW }))
      .toEqual({ smsOptedOutAt: NOW });
  });

  it("clears it when they are opted back in", () => {
    expect(smsOptOutUpdate({ requested: false, current: OCTOBER, now: NOW }))
      .toEqual({ smsOptedOutAt: null });
  });

  it("does NOT move the date of a client who was already opted out", () => {
    /*
     * The whole reason this is a function. The checkbox rides along on
     * the "Edit details" form, so somebody fixing a phone number on a
     * client who opted out in October would otherwise silently restamp
     * it to today — and that date is the only record of when they asked,
     * which is what answers "were they opted out when we sent this?".
     */
    expect(smsOptOutUpdate({ requested: true, current: OCTOBER, now: NOW })).toEqual({});
  });

  it("accepts the stored value as a string, which is how it comes off the wire", () => {
    expect(smsOptOutUpdate({ requested: true, current: OCTOBER.toISOString(), now: NOW })).toEqual({});
  });

  it("changes nothing when the form did not touch it", () => {
    // Every other caller of updateDetails sends only what changed; this
    // field must behave the same or a phone edit would opt somebody in.
    expect(smsOptOutUpdate({ requested: undefined, current: OCTOBER, now: NOW })).toEqual({});
    expect(smsOptOutUpdate({ requested: undefined, current: null, now: NOW })).toEqual({});
  });

  it("opting back in is not conditional on how it was set", () => {
    // A STOP reply and this checkbox write the same field, so clearing
    // has to work whichever set it.
    expect(smsOptOutUpdate({ requested: false, current: null, now: NOW }))
      .toEqual({ smsOptedOutAt: null });
  });
});

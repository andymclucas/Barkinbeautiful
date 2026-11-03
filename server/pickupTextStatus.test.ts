import { describe, expect, it } from "vitest";
import { awaitingPickupText, pickupTextStatus } from "../shared/pickupTextStatus";

const TEXTED = new Date("2026-11-03T04:14:00Z"); // 2:14pm Brisbane

const row = (workflowState: string, pickupTextSentAt: unknown = null) =>
  ({ workflowState, pickupTextSentAt } as Parameters<typeof pickupTextStatus>[0]);

describe("pickupTextStatus — when nothing should be drawn", () => {
  it("says nothing about a dog that is not ready yet", () => {
    // Most of the board, most of the day. A "not texted" marker on a dog in
    // the bath is a false alarm, and an indicator that cries wolf all
    // morning is ignored by the time it means something.
    for (const state of [
      "scheduled", "checked_in", "waiting_for_bath", "bathing",
      "waiting_for_dry", "drying", "waiting_for_groom", "grooming",
    ]) {
      expect(pickupTextStatus(row(state)).show).toBe(false);
    }
  });

  it("says nothing about a cancelled or no-show dog", () => {
    // Nobody is coming to collect it, so there was nothing to send.
    expect(pickupTextStatus(row("cancelled")).show).toBe(false);
    expect(pickupTextStatus(row("no_show")).show).toBe(false);
  });

  it("says nothing when the state is missing or unrecognised", () => {
    expect(pickupTextStatus(row("")).show).toBe(false);
    expect(pickupTextStatus({ workflowState: null, pickupTextSentAt: null }).show).toBe(false);
    expect(pickupTextStatus({ workflowState: undefined, pickupTextSentAt: null }).show).toBe(false);
  });
});

describe("pickupTextStatus — the dog is ready", () => {
  it("flags a ready dog whose owner has not been told", () => {
    // The one Lauren is hunting for: the dog is standing in the salon and
    // nobody has rung.
    expect(pickupTextStatus(row("ready"))).toEqual({ show: true, sent: false, urgent: true });
  });

  it("reports the time when the owner has been told", () => {
    expect(pickupTextStatus(row("ready", TEXTED))).toEqual({ show: true, sent: true, at: TEXTED });
  });
});

describe("pickupTextStatus — the dog has gone", () => {
  it("still shows that a collected dog was texted", () => {
    expect(pickupTextStatus(row("complete", TEXTED))).toEqual({ show: true, sent: true, at: TEXTED });
  });

  it("reports an untexted collected dog, but not as urgent", () => {
    // Normal: the owner was at the counter, or rang ahead. Nothing to do,
    // so the board must not shout about it.
    expect(pickupTextStatus(row("complete"))).toEqual({ show: true, sent: false, urgent: false });
  });
});

describe("pickupTextStatus — what comes back off the wire", () => {
  it("accepts a date as a string, which is how a cached payload arrives", () => {
    const status = pickupTextStatus(row("ready", TEXTED.toISOString()));
    expect(status).toMatchObject({ show: true, sent: true });
    expect((status as { at: Date }).at.getTime()).toBe(TEXTED.getTime());
  });

  it("accepts epoch milliseconds", () => {
    const status = pickupTextStatus(row("ready", TEXTED.getTime()));
    expect((status as { at: Date }).at.getTime()).toBe(TEXTED.getTime());
  });

  it("treats an unparseable value as not texted, never as the epoch", () => {
    // "Texted 10:00am on 1 January 1970" is worse than saying nothing: it
    // reads as done, and nobody rings the owner.
    for (const junk of ["", "not a date", NaN, undefined, null]) {
      expect(pickupTextStatus(row("ready", junk))).toEqual({ show: true, sent: false, urgent: true });
    }
  });
});

describe("awaitingPickupText", () => {
  it("counts only the ready dogs nobody has told", () => {
    const board = [
      row("bathing"),                 // too early
      row("ready"),                   // counts
      row("ready", TEXTED),           // told
      row("ready"),                   // counts
      row("complete"),                // gone, not urgent
      row("complete", TEXTED),        // gone, told
      row("cancelled"),               // not coming
    ];
    expect(awaitingPickupText(board)).toBe(2);
  });

  it("is zero for an empty board", () => {
    expect(awaitingPickupText([])).toBe(0);
  });

  it("is zero when every ready dog has been told", () => {
    expect(awaitingPickupText([row("ready", TEXTED), row("complete", TEXTED)])).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createInMemoryTransport, type EventTransport } from "./eventBus";

/**
 * The contract, not the implementation.
 *
 * These are the promises a Redis transport would also have to keep, so they
 * are written against the interface. If one is swapped in, run this suite
 * against it before trusting it.
 */
function contractTests(name: string, make: () => EventTransport) {
  describe(name, () => {
    const ev = (tenantId: number) => ({ type: "data-changed" as const, tenantId, topics: ["workflow"], source: "t" });

    it("delivers a published event to a subscriber", () => {
      const t = make();
      const seen = vi.fn();
      t.subscribe(seen);
      t.publish(ev(1));
      expect(seen).toHaveBeenCalledWith(ev(1));
    });

    it("delivers to every subscriber, not just the first", () => {
      // One per connected browser tab. A transport that fans out to only one
      // would look fine with a single tab open and fail in the salon.
      const t = make();
      const a = vi.fn(), b = vi.fn(), c = vi.fn();
      t.subscribe(a); t.subscribe(b); t.subscribe(c);
      t.publish(ev(1));
      for (const fn of [a, b, c]) expect(fn).toHaveBeenCalledTimes(1);
    });

    it("stops delivering after unsubscribe", () => {
      // A tab that closed must stop receiving, or the listener leaks and
      // Node starts warning about max listeners.
      const t = make();
      const seen = vi.fn();
      const off = t.subscribe(seen);
      off();
      t.publish(ev(1));
      expect(seen).not.toHaveBeenCalled();
    });

    it("unsubscribing one leaves the others connected", () => {
      const t = make();
      const stays = vi.fn(), goes = vi.fn();
      t.subscribe(stays);
      t.subscribe(goes)();
      t.publish(ev(1));
      expect(stays).toHaveBeenCalledTimes(1);
      expect(goes).not.toHaveBeenCalled();
    });

    it("delivers nothing when nobody is listening", () => {
      expect(() => make().publish(ev(1))).not.toThrow();
    });

    it("passes the event through unchanged, including its tenant", () => {
      // Tenant scoping is done by the SSE endpoint reading this field, so the
      // transport must not drop or rewrite it.
      const t = make();
      let got: any;
      t.subscribe((e) => { got = e; });
      t.publish(ev(42));
      expect(got.tenantId).toBe(42);
      expect(got.topics).toEqual(["workflow"]);
    });

    it("names itself, so the boot log can say which one is running", () => {
      expect(make().name).toBeTruthy();
    });
  });
}

contractTests("in-memory transport", createInMemoryTransport);

describe("in-memory transport, specifically", () => {
  it("gives each instance its own subscribers", () => {
    // Two instances must not cross-talk, or a test leaks into the next one.
    const a = createInMemoryTransport(), b = createInMemoryTransport();
    const seen = vi.fn();
    a.subscribe(seen);
    b.publish({ type: "data-changed", tenantId: 1, topics: ["workflow"], source: "t" });
    expect(seen).not.toHaveBeenCalled();
  });

  it("carries more subscribers than Node's default warning threshold", () => {
    // One per tab; ten is Node's default and a salon has more than ten tabs.
    const t = createInMemoryTransport();
    const offs = Array.from({ length: 50 }, () => t.subscribe(vi.fn()));
    expect(() => t.publish({ type: "data-changed", tenantId: 1, topics: ["x"], source: "t" })).not.toThrow();
    offs.forEach((off) => off());
  });
});

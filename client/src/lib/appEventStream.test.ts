import { describe, it, expect, beforeEach, vi } from "vitest";
import { subscribeToAppEvents, appEventStreamState } from "./appEventStream";

/**
 * One connection, however many subscribers.
 *
 * Each EventSource is a held-open HTTP connection and a tab gets six in
 * total on HTTP/1.1. The bell, the call alert and the invalidator
 * already take one each; presence can mount twice at once.
 */
class FakeEventSource {
  static open = 0;
  static last: FakeEventSource | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.open += 1;
    FakeEventSource.last = this;
  }
  close() { this.closed = true; FakeEventSource.open -= 1; }
  emit(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}

beforeEach(() => {
  FakeEventSource.open = 0;
  FakeEventSource.last = null;
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("appEventStream", () => {
  it("opens one connection for many subscribers", () => {
    const a = subscribeToAppEvents(() => {});
    const b = subscribeToAppEvents(() => {});
    const c = subscribeToAppEvents(() => {});
    expect(FakeEventSource.open).toBe(1);
    expect(appEventStreamState().listeners).toBe(3);
    a(); b(); c();
  });

  it("closes it only after the last subscriber leaves", () => {
    const a = subscribeToAppEvents(() => {});
    const b = subscribeToAppEvents(() => {});
    a();
    expect(appEventStreamState().open).toBe(true);
    b();
    expect(appEventStreamState().open).toBe(false);
    expect(FakeEventSource.open).toBe(0);
  });

  it("reopens after everyone has left and someone comes back", () => {
    subscribeToAppEvents(() => {})();
    expect(appEventStreamState().open).toBe(false);
    const again = subscribeToAppEvents(() => {});
    expect(appEventStreamState().open).toBe(true);
    again();
  });

  it("fans every event out to every subscriber", () => {
    const seen: string[] = [];
    const a = subscribeToAppEvents((e) => seen.push(`a:${e.type}`));
    const b = subscribeToAppEvents((e) => seen.push(`b:${e.type}`));
    FakeEventSource.last!.emit({ type: "presence-changed" });
    expect(seen).toEqual(["a:presence-changed", "b:presence-changed"]);
    a(); b();
  });

  it("keeps delivering when one subscriber throws", () => {
    // One bad subscriber must not take out the bell and the invalidator.
    const seen: string[] = [];
    const bad = subscribeToAppEvents(() => { throw new Error("boom"); });
    const good = subscribeToAppEvents((e) => seen.push(String(e.type)));
    expect(() => FakeEventSource.last!.emit({ type: "ping" })).not.toThrow();
    expect(seen).toEqual(["ping"]);
    bad(); good();
  });

  it("ignores a malformed payload rather than throwing", () => {
    const seen: unknown[] = [];
    const off = subscribeToAppEvents((e) => seen.push(e));
    expect(() => FakeEventSource.last!.onmessage?.({ data: "not json" })).not.toThrow();
    expect(seen).toEqual([]);
    off();
  });

  it("stops delivering to a subscriber that has unsubscribed", () => {
    const seen: string[] = [];
    const off = subscribeToAppEvents((e) => seen.push(String(e.type)));
    const keep = subscribeToAppEvents(() => {});
    off();
    FakeEventSource.last!.emit({ type: "after" });
    expect(seen).toEqual([]);
    keep();
  });
});

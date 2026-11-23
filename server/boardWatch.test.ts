import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardWatch } from "./boardWatch";

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("board cache", () => {
  it("shares one load between every screen asking within the minute", async () => {
    let clock = 0;
    const watch = createBoardWatch({ loadVersion: async () => "1:1", now: () => clock });
    const load = vi.fn(async () => ["board"]);
    const a = watch.getCachedBoard(1, "2026-11-24", load);
    const b = watch.getCachedBoard(1, "2026-11-24", load);
    expect(a).toBe(b);
    expect(await b).toEqual(["board"]);
    clock = 59_999;
    await watch.getCachedBoard(1, "2026-11-24", load);
    expect(load).toHaveBeenCalledTimes(1);
    clock = 60_000;
    await watch.getCachedBoard(1, "2026-11-24", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps salons and days apart", async () => {
    const watch = createBoardWatch({ loadVersion: async () => "1:1" });
    const load = vi.fn(async () => []);
    await watch.getCachedBoard(1, "2026-11-24", load);
    await watch.getCachedBoard(2, "2026-11-24", load);
    await watch.getCachedBoard(1, "2026-11-25", load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not hand a failed load to the next screen", async () => {
    const watch = createBoardWatch({ loadVersion: async () => "1:1" });
    await expect(watch.getCachedBoard(1, "d", async () => { throw new Error("db down"); })).rejects.toThrow();
    await flush();
    const load = vi.fn(async () => ["ok"]);
    expect(await watch.getCachedBoard(1, "d", load)).toEqual(["ok"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("nudging a salon drops only that salon's boards", async () => {
    const watch = createBoardWatch({ loadVersion: async () => "1:1" });
    await watch.getCachedBoard(1, "a", async () => 1);
    await watch.getCachedBoard(1, "b", async () => 1);
    await watch.getCachedBoard(2, "a", async () => 1);
    watch.nudgeBoards(1);
    expect(watch.state().cached).toEqual(["2|a"]);
  });
});

describe("board watcher", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("checks once per salon and day however many screens watch, and stops with the last", async () => {
    const loadVersion = vi.fn(async () => "3:1");
    const watch = createBoardWatch({ loadVersion, intervalMs: 5_000 });
    const stopA = watch.watchBoard(1, "d", () => {});
    const stopB = watch.watchBoard(1, "d", () => {});
    await flush();
    expect(loadVersion).toHaveBeenCalledTimes(1); // the starting fingerprint
    await vi.advanceTimersByTimeAsync(15_000);
    expect(loadVersion).toHaveBeenCalledTimes(4);
    stopA();
    stopA(); // a second close is harmless
    await vi.advanceTimersByTimeAsync(5_000);
    expect(loadVersion).toHaveBeenCalledTimes(5);
    stopB();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(loadVersion).toHaveBeenCalledTimes(5);
    expect(watch.state().watched).toEqual([]);
  });

  it("tells every screen and drops the cache when the day changes, not before", async () => {
    let version = "3:1";
    const watch = createBoardWatch({ loadVersion: async () => version, intervalMs: 5_000 });
    const a = vi.fn();
    const b = vi.fn();
    watch.watchBoard(1, "d", a);
    watch.watchBoard(1, "d", b);
    await flush();
    await watch.getCachedBoard(1, "d", async () => "old");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(a).not.toHaveBeenCalled();
    expect(watch.state().cached).toEqual(["1|d"]);
    version = "3:2";
    await vi.advanceTimersByTimeAsync(5_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(watch.state().cached).toEqual([]);
  });

  it("nudges only the salon whose data changed", async () => {
    const watch = createBoardWatch({ loadVersion: async () => "1:1" });
    const mine = vi.fn();
    const theirs = vi.fn();
    watch.watchBoard(1, "d", mine);
    watch.watchBoard(2, "d", theirs);
    watch.nudgeBoards(1);
    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
  });

  it("keeps watching through a failed check", async () => {
    let fail = true;
    const loadVersion = vi.fn(async () => { if (fail) throw new Error("db down"); return "1:1"; });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const watch = createBoardWatch({ loadVersion, intervalMs: 5_000 });
    watch.watchBoard(1, "d", () => {});
    await flush();
    fail = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(loadVersion).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

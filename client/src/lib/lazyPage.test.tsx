import { describe, it, expect, beforeEach, vi } from "vitest";
import { lazyPage } from "./lazyPage";

/**
 * The behaviour that matters is what happens when a chunk is GONE,
 * which is the state every open tab is in the moment a deploy lands.
 */
describe("lazyPage", () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    window.sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  /** React keeps the loader on the lazy object; Suspense invokes it. */
  const loaderOf = (Lazy: unknown) =>
    (Lazy as { _payload: { _result: () => Promise<{ default: unknown }> } })._payload._result;

  it("loads a page normally when the chunk is there", async () => {
    const Page = () => null;
    const loaded = await loaderOf(lazyPage(async () => ({ default: Page })))();
    expect(loaded.default).toBe(Page);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads the page when the chunk has gone", async () => {
    const Lazy = lazyPage(async () => {
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    // Never settles on purpose, so race it against a tick.
    await Promise.race([loaderOf(Lazy)(), new Promise((r) => setTimeout(r, 20))]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  /**
   * A chunk that is genuinely broken — rather than merely stale — must
   * not put the salon's screens into a reload loop.
   */
  it("refuses to reload twice in quick succession", async () => {
    const make = () => lazyPage(async () => { throw new Error("gone"); });

    await Promise.race([loaderOf(make())(), new Promise((r) => setTimeout(r, 20))]);
    expect(reload).toHaveBeenCalledTimes(1);

    await expect(loaderOf(make())()).rejects.toThrow("gone");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("surfaces the error instead of looping when storage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(loaderOf(lazyPage(async () => { throw new Error("gone"); }))()).rejects.toThrow("gone");
    expect(reload).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});

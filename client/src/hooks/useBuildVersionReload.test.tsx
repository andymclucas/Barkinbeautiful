import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBuildVersionReload } from "./useBuildVersionReload";

/**
 * The TV is the whole point, so these drive the real polling loop
 * rather than the regex underneath it: mount, let a deploy happen,
 * check it reloads.
 */
const CURRENT = "index-CKCfpWYC.js";
const indexHtml = (id: string) =>
  `<!doctype html><script type="module" crossorigin src="/assets/${id}"></script>`;

describe("useBuildVersionReload", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    reload.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    // The page is "running" the current build.
    document.head.innerHTML = `<script src="/assets/${CURRENT}"></script>`;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = "";
  });

  const serve = (body: string, ok = true) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok, text: async () => body,
    }));

  it("reloads once the server is serving a different build", async () => {
    serve(indexHtml("index-NEWBUILD.js"));
    renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));

    expect(reload).not.toHaveBeenCalled();   // nothing on mount
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves the screen alone while the build is unchanged", async () => {
    serve(indexHtml(CURRENT));
    renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });

  /** Salon wifi drops. A failed fetch is not news. */
  it("does not reload when the check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload on a captive portal or an error page", async () => {
    serve("<h1>Sign in to continue</h1>", true);
    renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload on a non-ok response", async () => {
    serve(indexHtml("index-NEWBUILD.js"), false);
    renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });

  /**
   * In development Vite serves an unhashed entry, so there is no
   * version to compare and the hook must not poll at all.
   */
  it("stands down entirely in development", async () => {
    document.head.innerHTML = `<script type="module" src="/src/main.tsx"></script>`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  /**
   * The staff board is cast to a screen AND typed into, so it must be
   * told rather than reloaded — a reload mid-sentence loses whatever
   * somebody was entering.
   */
  it("notifies instead of reloading when asked to", async () => {
    serve(indexHtml("index-NEWBUILD.js"));
    const onNewBuild = vi.fn();
    renderHook(() => useBuildVersionReload({ intervalMs: 1000, mode: "notify", onNewBuild }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onNewBuild).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("stays quiet in notify mode while the build is unchanged", async () => {
    serve(indexHtml(CURRENT));
    const onNewBuild = vi.fn();
    renderHook(() => useBuildVersionReload({ intervalMs: 1000, mode: "notify", onNewBuild }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(onNewBuild).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("stops polling once the screen unmounts", async () => {
    serve(indexHtml(CURRENT));
    const { unmount } = renderHook(() => useBuildVersionReload({ intervalMs: 1000 }));
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
  });
});

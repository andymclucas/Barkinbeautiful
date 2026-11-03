import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CHIME_MAX_MS, CHIME_URL, CHIME_VOLUME, playFestiveChime, stopFestiveChime,
} from "./festiveChime";

/**
 * A fake audio element, recording what it was asked to do.
 *
 * No test runner has a sound card, and what is worth testing is the
 * behaviour around the sound - that it is fetched from the right place,
 * played at a sensible volume, cannot stack two copies, and never throws
 * when the device refuses - not whether a speaker moved.
 */
function fakeAudio(opts: {
  playRejects?: Error | boolean;
  throwOnPlay?: boolean;
} = {}) {
  const made: string[] = [];
  const listeners: Record<string, (() => void)[]> = {};
  const el = {
    volume: 1,
    currentTime: 5,
    played: 0,
    paused: 0,
    error: null as { code: number } | null,
    play() {
      if (opts.throwOnPlay) throw new Error("no output device");
      this.played += 1;
      if (!opts.playRejects) return Promise.resolve();
      return Promise.reject(
        opts.playRejects === true ? new Error("blocked") : opts.playRejects,
      );
    },
    pause() { this.paused += 1; },
    addEventListener(name: string, fn: () => void) {
      (listeners[name] ??= []).push(fn);
    },
    /** Fire the element's error event, as a browser would on a bad file. */
    failWith(code: number) {
      el.error = { code };
      for (const fn of listeners.error ?? []) fn();
    },
  };
  const make = (src: string) => { made.push(src); return el as unknown as HTMLAudioElement; };
  return { make, el, made };
}

beforeEach(() => { stopFestiveChime(); });
afterEach(() => { vi.useRealTimers(); stopFestiveChime(); });

describe("playFestiveChime", () => {
  it("plays the recording from where it is actually served", () => {
    const { make, made } = fakeAudio();
    playFestiveChime(make);
    expect(made).toEqual([CHIME_URL]);
    expect(CHIME_URL).toBe("/jingle-bells.mp3");
  });

  it("is fetched on demand rather than bundled", () => {
    // 180KB on every page load, for a button most people never press, on
    // a board that runs all day on salon wifi. A path under /public is
    // what keeps it off the critical path.
    expect(CHIME_URL.startsWith("/")).toBe(true);
    expect(CHIME_URL).not.toMatch(/^data:/);
  });

  it("actually starts it", () => {
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    expect(el.played).toBe(1);
  });

  it("plays below full scale, because a mastered recording is loud", () => {
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    expect(el.volume).toBe(CHIME_VOLUME);
    expect(CHIME_VOLUME).toBeGreaterThan(0.2);
    expect(CHIME_VOLUME).toBeLessThan(1);
  });

  it("never stacks two copies over each other", () => {
    // Two presses in quick succession, or a double click on the tree.
    const first = fakeAudio();
    playFestiveChime(first.make);
    const second = fakeAudio();
    playFestiveChime(second.make);
    expect(first.el.paused).toBe(1);
    expect(second.el.played).toBe(1);
  });

  it("rewinds, so a second press starts from the top", () => {
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    stopFestiveChime();
    expect(el.currentTime).toBe(0);
  });

  it("stops itself once the recording has had time to finish", () => {
    vi.useFakeTimers();
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    expect(el.paused).toBe(0);
    vi.advanceTimersByTime(CHIME_MAX_MS + 10);
    expect(el.paused).toBe(1);
  });
});

describe("stopFestiveChime", () => {
  it("silences whatever is playing", () => {
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    stopFestiveChime();
    expect(el.paused).toBe(1);
  });

  it("does nothing, and throws nothing, when there is no music", () => {
    expect(() => stopFestiveChime()).not.toThrow();
    expect(() => { stopFestiveChime(); stopFestiveChime(); }).not.toThrow();
  });

  it("cancels the auto-stop, so a later press is not cut short", () => {
    vi.useFakeTimers();
    const first = fakeAudio();
    playFestiveChime(first.make);
    stopFestiveChime();
    const second = fakeAudio();
    playFestiveChime(second.make);
    // The first play's timer must not fire and silence the second.
    vi.advanceTimersByTime(CHIME_MAX_MS - 100);
    expect(second.el.paused).toBe(0);
  });
});

describe("when the device will not cooperate", () => {
  it("swallows a blocked autoplay rather than logging an unhandled rejection", async () => {
    // play() rejects when a kiosk policy or a muted device refuses. It
    // should not happen from inside a click, but it still must not throw.
    //
    // NotAllowedError specifically, because that is the name a browser
    // actually gives a block - a bare Error here would be testing a
    // rejection that cannot happen, and would trip the warning added for
    // genuine failures.
    const blocked = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    const { make } = fakeAudio({ playRejects: blocked });
    expect(() => playFestiveChime(make)).not.toThrow();
    await Promise.resolve();
  });

  it("swallows a device that throws outright", () => {
    const { make } = fakeAudio({ throwOnPlay: true });
    expect(() => playFestiveChime(make)).not.toThrow();
  });

  it("does nothing when the browser has no Audio at all", () => {
    // A locked-down environment, or server-side rendering. The theme must
    // still change; audio is the least important thing on the page.
    const original = globalThis.Audio;
    // @ts-expect-error - deliberately removing it
    delete globalThis.Audio;
    expect(() => playFestiveChime()).not.toThrow();
    globalThis.Audio = original;
  });
});

describe("saying so when the file will not load", () => {
  /*
   * The app answers an unknown path with index.html and a 200 rather than
   * a 404 - verified against production 03/11/2026. So a chime missing
   * from the deploy does not fail loudly: the browser gets HTML, cannot
   * decode it, and every failure path here is a silent return by design.
   * Without a warning the symptom is "no music, no error anywhere".
   */
  it("warns, and names the catch-all, when the file is not really audio", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    el.failWith(4); // MEDIA_ERR_SRC_NOT_SUPPORTED
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain(CHIME_URL);
    expect(message).toMatch(/missing from the deploy/);
    // The instinct on a media error is to check the request, and the
    // request looks fine - so the message has to say that.
    expect(message).toMatch(/index\.html|200/);
    warn.mockRestore();
  });

  it("warns with the code for any other media failure", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { make, el } = fakeAudio();
    playFestiveChime(make);
    el.failWith(2); // MEDIA_ERR_NETWORK
    expect(String(warn.mock.calls[0][0])).toContain("code 2");
    warn.mockRestore();
  });

  it("says nothing at all when the file loads", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { make } = fakeAudio();
    playFestiveChime(make);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stays quiet when the browser simply blocks autoplay", async () => {
    // Not a fault: a kiosk policy or a muted device refusing is the
    // browser working as designed, and nothing is broken. Warning here
    // would train people to ignore the warning that matters.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocked = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    const { make } = fakeAudio({ playRejects: blocked });
    playFestiveChime(make);
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does warn when play fails for a reason that is not a block", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const odd = Object.assign(new Error("gone"), { name: "NotSupportedError" });
    const { make } = fakeAudio({ playRejects: odd });
    playFestiveChime(make);
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("NotSupportedError");
    warn.mockRestore();
  });
});

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
function fakeAudio(opts: { playRejects?: boolean; throwOnPlay?: boolean } = {}) {
  const made: string[] = [];
  const el = {
    volume: 1,
    currentTime: 5,
    played: 0,
    paused: 0,
    play() {
      if (opts.throwOnPlay) throw new Error("no output device");
      this.played += 1;
      return opts.playRejects ? Promise.reject(new Error("blocked")) : Promise.resolve();
    },
    pause() { this.paused += 1; },
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
    const { make } = fakeAudio({ playRejects: true });
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

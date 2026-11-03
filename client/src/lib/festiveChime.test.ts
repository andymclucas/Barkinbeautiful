import { describe, it, expect, vi } from "vitest";
import {
  BEAT_MS, CHIME_GAIN, JINGLE_BELLS, chimeDurationMs, noteHz, playFestiveChime,
} from "./festiveChime";

/**
 * A fake audio device, recording what it was asked to play.
 *
 * No test runner has a sound card, and the thing worth testing is the
 * sequencing - that six notes are scheduled, back to back, at the right
 * pitches and a quiet volume - not whether a speaker moved.
 */
function fakeAudio() {
  const notes: { hz: number; start: number; stop: number; type: string }[] = [];
  const gains: number[] = [];
  let closed = false;
  class Ctx {
    currentTime = 0;
    destination = {};
    createOscillator() {
      const osc = {
        type: "", frequency: { value: 0 }, connect: () => {},
        start: (t: number) => { (osc as any)._s = t; },
        stop: (t: number) => notes.push({ hz: osc.frequency.value, start: (osc as any)._s, stop: t, type: osc.type }),
      };
      return osc as unknown as OscillatorNode;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: (v: number) => { gains.push(v); },
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      } as unknown as GainNode;
    }
    close() { closed = true; return Promise.resolve(); }
  }
  return { Ctx: Ctx as unknown as new () => AudioContext, notes, gains, isClosed: () => closed };
}

describe("the melody", () => {
  it("is the opening of Jingle Bells and stops there", () => {
    // The full line runs about four seconds, which is a long time to stand
    // at a counter listening to a theme switch.
    expect(JINGLE_BELLS).toHaveLength(6);
    expect(JINGLE_BELLS.every((n) => n.note === "E5")).toBe(true);
  });

  it("is over before it can irritate anyone", () => {
    expect(chimeDurationMs()).toBeLessThan(2000);
  });

  it("has the jin-gle BELLS rhythm, not six equal notes", () => {
    // Three notes of equal length is a doorbell. The long third beat is
    // what makes it the tune.
    expect(JINGLE_BELLS.map((n) => n.beats)).toEqual([1, 1, 2, 1, 1, 2]);
  });

  it("knows the pitches it uses and nothing else", () => {
    expect(noteHz("E5")).toBeCloseTo(659.25, 2);
    expect(noteHz("nonsense")).toBeNull();
  });
});

describe("playFestiveChime", () => {
  it("schedules every note, back to back", () => {
    const { Ctx, notes } = fakeAudio();
    playFestiveChime(Ctx);
    expect(notes).toHaveLength(6);
    for (let i = 1; i < notes.length; i += 1) {
      // No gaps and no overlaps: a snippet that stutters sounds broken.
      expect(notes[i].start).toBeCloseTo(notes[i - 1].stop, 6);
    }
  });

  it("plays them at the right pitch and for the right length", () => {
    const { Ctx, notes } = fakeAudio();
    playFestiveChime(Ctx);
    expect(notes[0].hz).toBeCloseTo(659.25, 2);
    expect(notes[0].stop - notes[0].start).toBeCloseTo(BEAT_MS / 1000, 6);
    // The third note is the long one.
    expect(notes[2].stop - notes[2].start).toBeCloseTo((BEAT_MS * 2) / 1000, 6);
  });

  it("stays quiet, because it plays in a room with clients in it", () => {
    const { Ctx, gains } = fakeAudio();
    playFestiveChime(Ctx);
    expect(gains.length).toBeGreaterThan(0);
    for (const g of gains) expect(g).toBeLessThanOrEqual(0.1);
    expect(CHIME_GAIN).toBeLessThanOrEqual(0.1);
  });

  it("uses a triangle, not a sine or a square", () => {
    // A sine is a test tone and a square is an alarm clock.
    const { Ctx, notes } = fakeAudio();
    playFestiveChime(Ctx);
    expect(notes.every((n) => n.type === "triangle")).toBe(true);
  });

  it("lets go of the audio device when it has finished", async () => {
    // The salon board is a tab left open for weeks; a context held open
    // holds an audio stream with it.
    vi.useFakeTimers();
    const { Ctx, isClosed } = fakeAudio();
    playFestiveChime(Ctx);
    expect(isClosed()).toBe(false);
    await vi.advanceTimersByTimeAsync(chimeDurationMs() + 500);
    expect(isClosed()).toBe(true);
    vi.useRealTimers();
  });
});

describe("playFestiveChime — when there is no audio", () => {
  it("does nothing rather than throwing when the browser has no AudioContext", () => {
    // A locked-down kiosk, or a browser that refuses. The theme must still
    // change; audio is the least important thing on the page.
    expect(() => playFestiveChime(undefined as never, JINGLE_BELLS)).not.toThrow();
  });

  it("swallows a device that throws on construction", () => {
    const Exploding = class { constructor() { throw new Error("no output device"); } };
    expect(() => playFestiveChime(Exploding as unknown as new () => AudioContext)).not.toThrow();
  });

  it("swallows a device that throws part-way through", () => {
    const { Ctx } = fakeAudio();
    class HalfBroken extends (Ctx as unknown as { new (): AudioContext & { createOscillator(): OscillatorNode } }) {
      createOscillator(): OscillatorNode { throw new Error("gone"); }
    }
    expect(() => playFestiveChime(HalfBroken as unknown as new () => AudioContext)).not.toThrow();
  });

  it("skips a note it does not know rather than playing silence badly", () => {
    const { Ctx, notes } = fakeAudio();
    playFestiveChime(Ctx, [{ note: "E5", beats: 1 }, { note: "???", beats: 1 }, { note: "E5", beats: 1 }]);
    expect(notes).toHaveLength(2);
    // The unknown note still takes its time, so the rhythm survives.
    expect(notes[1].start).toBeCloseTo(notes[0].stop + BEAT_MS / 1000, 6);
  });
});

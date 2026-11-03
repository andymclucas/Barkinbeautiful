/**
 * Eight notes of Jingle Bells when the tree goes on.
 *
 * Andy, 03/11/2026: "Can you play a quick Christmas song snippet when
 * switching to Xmas mode?"
 *
 * **It is synthesised, not a recording, and that is a licensing decision
 * rather than a technical one.** Nearly every Christmas song a salon would
 * actually want is in copyright, and so is every RECORDING of the ones
 * that are not - "Jingle Bells" as a tune has been public domain since
 * 1857, but a particular performance of it is somebody's property for
 * another seventy years. Bundling an mp3 into a commercial product sold to
 * other salons is the sort of thing that arrives as a letter. Oscillators
 * playing a public-domain melody owe nobody anything.
 *
 * It also keeps the bundle honest: this is about 2KB of code against the
 * 200KB+ an audio file would add to every page load, for something that
 * plays when somebody presses a tree.
 */

/** Equal temperament, A4 = 440Hz. Only the notes the melody needs. */
const NOTE_HZ: Record<string, number> = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
};

export type ChimeNote = {
  note: keyof typeof NOTE_HZ | string;
  /** Beats, where a beat is BEAT_MS. */
  beats: number;
};

/**
 * "Jingle bells, jingle bells" - the opening phrase and nothing else.
 *
 * The full line runs to about four seconds, which is a long time to stand
 * at a counter listening to a theme switch. Two bars is instantly
 * recognisable and over before it can irritate anyone.
 */
export const JINGLE_BELLS: ChimeNote[] = [
  { note: "E5", beats: 1 },
  { note: "E5", beats: 1 },
  { note: "E5", beats: 2 },
  { note: "E5", beats: 1 },
  { note: "E5", beats: 1 },
  { note: "E5", beats: 2 },
];

/** A brisk beat, so the whole thing is well under two seconds. */
export const BEAT_MS = 170;

/** Quiet. It plays in a room with dogs and clients in it. */
export const CHIME_GAIN = 0.07;

/** How long the snippet runs, for anything that needs to know. */
export function chimeDurationMs(melody: ChimeNote[] = JINGLE_BELLS): number {
  return melody.reduce((total, n) => total + n.beats * BEAT_MS, 0);
}

export function noteHz(note: string): number | null {
  return NOTE_HZ[note] ?? null;
}

type AudioContextCtor = new () => AudioContext;

/**
 * Play the snippet. Never throws, never blocks the caller.
 *
 * Audio is the least important thing on the page: a browser that refuses
 * to make a sound, a device with no output, or a locked-down kiosk must
 * all end up with a festive theme and no music rather than an error. Every
 * failure path here is a silent return.
 *
 * `ctor` is injectable so the sequencing can be tested without a real
 * audio device, which no test runner has.
 */
export function playFestiveChime(
  ctor?: AudioContextCtor,
  melody: ChimeNote[] = JINGLE_BELLS,
): void {
  try {
    const Ctx = ctor
      ?? (typeof window !== "undefined"
        ? ((window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) as AudioContextCtor | undefined)
        : undefined);
    if (!Ctx) return;

    const ctx = new Ctx();
    let at = ctx.currentTime;

    for (const { note, beats } of melody) {
      const hz = noteHz(note);
      const seconds = (beats * BEAT_MS) / 1000;
      if (hz === null) { at += seconds; continue; }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Triangle, not sine or square: a sine is a test tone and a square
      // is a 1980s alarm clock. Triangle has enough harmonics to read as
      // a bell without being harsh at this volume.
      osc.type = "triangle";
      osc.frequency.value = hz;

      /*
       * A struck-bell envelope - instant attack, long decay - rather than
       * a flat note. A gate that opens and shuts at full volume clicks
       * audibly at both ends, and six clicks is what makes a snippet
       * sound broken rather than cheap.
       */
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(CHIME_GAIN, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds * 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + seconds);
      at += seconds;
    }

    // Let go of the device once the last note has rung out. A context left
    // open holds an audio stream for the life of the tab, and the salon
    // board is a tab that stays open for weeks.
    const closeAt = (at - ctx.currentTime) * 1000 + 250;
    setTimeout(() => { void ctx.close().catch(() => {}); }, closeAt);
  } catch {
    // No audio is a perfectly good outcome. The theme still changed.
  }
}

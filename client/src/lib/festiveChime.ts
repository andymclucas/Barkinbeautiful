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
 * "Jingle bells, jingle bells, jingle all the way."
 *
 * Andy, 03/11/2026: "you can't tell it's Jingle Bells as it's only the
 * same note."
 *
 * He is right, and the first version was a plain mistake. It stopped
 * after "jingle bells, jingle bells" to keep the snippet short - but that
 * whole phrase is SIX REPEATS OF ONE NOTE. Everything that identifies the
 * tune is in the third phrase, where it finally moves: E up to G, drop to
 * C, back up through D to E. Without that it is not a melody at all, it
 * is one beep six times, and no amount of correct rhythm rescues it.
 *
 * The comment that used to sit here called two bars of a single pitch
 * "instantly recognisable", which should have been the giveaway.
 *
 * Worth keeping as a general lesson: a snippet trimmed for length has to
 * keep the part carrying the IDENTITY, and that is rarely the opening.
 */
export const JINGLE_BELLS: ChimeNote[] = [
  // Jin - gle  bells
  { note: "E5", beats: 1 },
  { note: "E5", beats: 1 },
  { note: "E5", beats: 2 },
  // Jin - gle  bells
  { note: "E5", beats: 1 },
  { note: "E5", beats: 1 },
  { note: "E5", beats: 2 },
  // Jin - gle  all --- the  way
  //
  // The long C against the quick D is what makes this sing rather than
  // march. Four even notes here reads as a doorbell; this is the bit
  // everybody actually hums.
  { note: "E5", beats: 1 },
  { note: "G5", beats: 1 },
  { note: "C5", beats: 1.5 },
  { note: "D5", beats: 0.5 },
  { note: "E5", beats: 4 },
];

/**
 * A little slower than the first attempt, which ran at 170ms a beat -
 * about 350bpm, fast enough to blur the phrase even once it had real
 * notes in it. Sixteen beats lands just under three seconds, roughly
 * double the original, which is what was asked for.
 */
export const BEAT_MS = 180;

/**
 * Andy, 03/11/2026: "Make it a bit louder".
 *
 * Doubled from 0.07, which was my guess at "quiet enough for a room with
 * clients in it" and turned out to be nearer inaudible. 0.15 is about
 * -16dB: clearly present, still well short of carrying across the salon.
 */
export const CHIME_GAIN = 0.15;

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

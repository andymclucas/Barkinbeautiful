/**
 * The Christmas snippet that plays when the tree goes on.
 *
 * Andy, 03/11/2026, having heard the synthesised version: "Use this
 * instead", with a Jingle Bells mp3.
 *
 * **On the licensing**, since the first version avoided a recording
 * specifically to dodge it: this file's ID3 tag names GarageBand 10.4.14
 * as the encoder and carries no artist, album or label. It is a recording
 * made here rather than one lifted from a commercial release, so the
 * performance rights are the salon's own and the composition has been
 * public domain since 1857. That is what makes shipping it fine in a
 * product sold to other salons. If it is ever swapped for something
 * downloaded, the question comes back.
 *
 * **Fetched on demand, not bundled.** It lives in client/public and is
 * requested the first time somebody presses the tree, so the 180KB costs
 * nothing on page load. The salon board runs all day on salon wifi and
 * most people will never press the button.
 */

/** Served straight from client/public. Hyphenated so the URL needs no encoding. */
export const CHIME_URL = "/jingle-bells.mp3";

/**
 * Andy asked for the synth version to be louder; a mastered recording is
 * a great deal hotter than an oscillator at -16dB, so this is well short
 * of full scale. One number to change if it wants adjusting.
 */
export const CHIME_VOLUME = 0.6;

/**
 * How long to let it run before stopping it.
 *
 * The file is about 7.5 seconds. That is a long time for a theme toggle,
 * and someone who switches the tree on and straight off again should not
 * be left with music playing over a theme that is no longer on. Stopping
 * it is also what `stopFestiveChime` is for.
 */
export const CHIME_MAX_MS = 8_000;

/** The element currently playing, so a second press cannot stack two. */
let current: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Play the snippet. Never throws, never blocks the caller.
 *
 * Audio is the least important thing on the page: a browser that refuses
 * to play, a device with no output, a missing file, or a locked-down
 * kiosk must all end up with a festive theme and no music rather than an
 * error. Every failure path is a silent return.
 *
 * `make` is injectable so the behaviour can be tested without a real
 * audio device, which no test runner has.
 */
export function playFestiveChime(make?: (src: string) => HTMLAudioElement): void {
  try {
    stopFestiveChime();

    const audio = make
      ? make(CHIME_URL)
      : (typeof Audio !== "undefined" ? new Audio(CHIME_URL) : null);
    if (!audio) return;

    audio.volume = CHIME_VOLUME;
    current = audio;

    /*
     * play() returns a promise that REJECTS when the browser blocks
     * autoplay. Unhandled, that is an console error on every blocked
     * press. It should not be blocked here - this is called straight out
     * of a click - but a kiosk policy or a muted device can still refuse.
     */
    const started = audio.play() as unknown as Promise<void> | undefined;
    if (started && typeof started.catch === "function") started.catch(() => {});

    stopTimer = setTimeout(stopFestiveChime, CHIME_MAX_MS);
  } catch {
    // No audio is a perfectly good outcome. The theme still changed.
  }
}

/**
 * Stop whatever is playing, if anything.
 *
 * Exported because turning the theme off while the music is still going
 * should silence it - the sound belongs to the theme being on.
 */
export function stopFestiveChime(): void {
  try {
    if (stopTimer !== null) { clearTimeout(stopTimer); stopTimer = null; }
    if (!current) return;
    current.pause();
    // Rewound so a second press starts from the top rather than from
    // wherever the last one was cut off.
    current.currentTime = 0;
    current = null;
  } catch {
    current = null;
  }
}

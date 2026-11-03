/**
 * Snow falling down the screen while the Christmas music plays.
 *
 * Andy, 03/11/2026: "Just snow flakes falling down the screen for the
 * duration of the audio that plays."
 *
 * Tied to the chime's length rather than running forever, which is the
 * difference between a flourish and a thing the salon has to look past
 * all afternoon. ThemeContext owns the timer, for the same reason it owns
 * the chime: both belong to the moment the tree is switched on.
 *
 * **It cannot be interacted with and it cannot be scrolled.** The overlay
 * is `fixed` and `pointer-events-none`, so a flake drifting over the New
 * Appointment button never eats the click, and a 110vh fall adds no
 * scroll height to the page.
 *
 * Drawn as transformed elements rather than on a canvas: ~40 divs moving
 * on `transform` and `opacity` alone composite on the GPU and need no
 * per-frame JavaScript, which matters on the wall board - that machine
 * drives a TV all day and has nothing to spare for a requestAnimationFrame
 * loop running a particle system.
 */
import { useMemo } from "react";

/** Enough to read as snow, few enough to stay cheap. */
const FLAKE_COUNT = 40;

/**
 * Deterministic-ish spread, generated once per mount.
 *
 * Random per flake, but computed in a `useMemo` so a re-render partway
 * through - a query settling, a toast appearing - does not reshuffle
 * every flake and make the snow jump.
 */
type Flake = {
  left: number;
  delay: number;
  duration: number;
  size: number;
  opacity: number;
  drift: number;
};

function makeFlakes(count: number): Flake[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    // Staggered starts, so it is already snowing rather than beginning
    // with one neat rank of flakes at the top of the screen.
    delay: Math.random() * 2.2,
    // A spread of speeds is most of what makes it read as depth.
    duration: 4.5 + Math.random() * 4,
    size: 4 + Math.random() * 7,
    opacity: 0.35 + Math.random() * 0.45,
    // Sideways drift, left or right, so they do not fall like rain.
    drift: (Math.random() - 0.5) * 120,
  }));
}

export function FestiveSnow({ count = FLAKE_COUNT }: { count?: number }) {
  const flakes = useMemo(() => makeFlakes(count), [count]);

  return (
    <div
      aria-hidden
      data-testid="festive-snow"
      className="festive-snow pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      {flakes.map((f, i) => (
        <span
          key={i}
          /* Colour comes from the stylesheet, per light/dark - see
                     index.css. A `bg-white` here was invisible against a
                     light-mode page, which is most of the screen. */
          className="festive-snowflake absolute top-0 rounded-full"
          style={{
            left: `${f.left}%`,
            width: `${f.size}px`,
            height: `${f.size}px`,
            opacity: f.opacity,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.duration}s`,
            ["--drift" as string]: `${f.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export default FestiveSnow;

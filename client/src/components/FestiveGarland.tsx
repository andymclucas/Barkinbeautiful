/**
 * A string of lights hung across the sidebar.
 *
 * Andy, 03/11/2026: "Make the Christmas theme more prominent."
 *
 * The theme before this was three colour tokens, and two of the three
 * were green — so turning it on swapped the salon's plum for a green and
 * that was the whole of it. Recolouring alone cannot say "Christmas",
 * because every salon's own brand is also just a colour. Something has
 * to be DRAWN.
 *
 * Hung under the sidebar header rather than across the content: the
 * sidebar is chrome, so decoration there is read as decoration, while
 * the same thing over the board would be read as a status bar by
 * somebody trying to find a dog. It is `pointer-events-none` and out of
 * flow, so nothing underneath moves or stops being clickable.
 *
 * **The wire is SVG and the bulbs are not**, which is the one structural
 * decision here. The sidebar is resizable and also collapses to a 3rem
 * rail, so a single stretched SVG distorts: at the default width the
 * viewBox scaled 1.87x across and 1.25x down, and every bulb came out an
 * oval. Stretching a WIRE is invisible — it is a curve either way — so
 * the wire keeps `preserveAspectRatio="none"` and the bulbs are
 * positioned elements that stay round at any width.
 */
import { FESTIVE_BULB_GOLD, FESTIVE_BULB_GREEN, FESTIVE_BULB_RED } from "@shared/brandPalette";

/**
 * Bulb positions along the wire, as fractions of the width.
 *
 * Evenly spaced with both ends skipped — a bulb sitting exactly on the
 * anchor point reads as a mistake rather than as a light.
 */
function bulbPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
}

/**
 * How many bulbs fit.
 *
 * Nine across an open sidebar. Three on the collapsed rail, which is
 * about 36px wide: a bulb is 9px, so the full string overlapped itself
 * into a single unreadable smear the moment somebody collapsed the nav.
 * The count has to come from the caller because only the layout knows
 * which state the sidebar is in.
 */
const FULL_BULBS = 9;
const RAIL_BULBS = 3;

/** Red, green, gold, repeating, so no two neighbours share a colour. */
const COLOURS = [FESTIVE_BULB_RED, FESTIVE_BULB_GREEN, FESTIVE_BULB_GOLD];

/**
 * The wire, as percentages of the container's height: it meets both
 * edges near the top and sags to roughly 43% in the middle.
 */
const WIRE_END = 8;
const WIRE_CONTROL = 78;

/** Where the wire sits at `t` across. Quadratic, both ends at WIRE_END. */
function wireY(t: number): number {
  return (1 - t) * (1 - t) * WIRE_END + 2 * (1 - t) * t * WIRE_CONTROL + t * t * WIRE_END;
}

export function FestiveGarland({ className, compact = false }: {
  className?: string;
  /** True when the sidebar is collapsed to its icon rail. */
  compact?: boolean;
}) {
  const bulbs = bulbPositions(compact ? RAIL_BULBS : FULL_BULBS);
  return (
    <div aria-hidden className={className}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d={`M 0 ${WIRE_END} Q 50 ${WIRE_CONTROL} 100 ${WIRE_END}`}
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {bulbs.map((t, i) => (
        <span
          key={t}
          className="festive-bulb absolute -translate-x-1/2"
          style={{
            left: `${t * 100}%`,
            top: `${wireY(t)}%`,
            // Three staggered groups, so the garland breathes unevenly the
            // way a real string does rather than pulsing as one block.
            animationDelay: `${(i % 3) * 0.9}s`,
          }}
        >
          {/* The cap, so the bulb hangs off the wire instead of floating on it. */}
          <span className="mx-auto block h-[3px] w-[4px] rounded-[1px] bg-white/40" />
          <span
            className="block h-[11px] w-[9px] rounded-[50%] shadow-[0_0_6px_1px_var(--festive-glow)]"
            style={{ background: COLOURS[i % COLOURS.length], ["--festive-glow" as string]: COLOURS[i % COLOURS.length] }}
          />
        </span>
      ))}
    </div>
  );
}

export default FestiveGarland;

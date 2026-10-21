import { clientFacingStage, stepStatus, GROOMING_STEPS } from "@shared/groomingStage";
import { GroomigoDogMark } from "./GroomigoDogMark";

/**
 * The six-step bar a client sees while their dog is in the salon.
 *
 * Checked-in · Bathing · Drying · Grooming · Ready for pickup · Picked up,
 * which is the layout Andy asked for on 21/10/2026.
 *
 * **Each step wears its stage's colour from the staff board** — cyan,
 * blue, violet, amber, emerald, slate — rather than all six being the
 * same brand purple. Andy, seeing it on a phone: "Make the different
 * grooming stages more evident and colourful. Possibly to match the
 * workflow board colour scheme." The colours come from
 * shared/workflowStageColours.ts, which the board reads too, so the two
 * cannot drift apart.
 *
 * Built for a phone first, because that is where an owner checks on
 * their dog. At 375px each of six columns gets about 50px, so the full
 * labels wrapped to two ragged lines of different heights; the bar uses
 * `short` there and the full label from `sm:` up. The headline above it
 * always spells the stage out in full, so nothing is lost.
 *
 * Extracted from ClientPortal so it has plain props and can be rendered
 * in a test — the portal page itself is 1,000 lines of tRPC and cannot
 * be. The Pet Tracker draws the same six as a vertical list.
 */
export function GroomProgressBar({
  workflowState,
  petName,
  className = "",
}: {
  workflowState: string | null | undefined;
  petName: string;
  className?: string;
}) {
  const stage = clientFacingStage(workflowState);

  // Cancelled, a no-show, or not arrived yet: there is no progress to draw,
  // and six grey dots would invite "why has nothing started".
  if (!stage.onBar) return null;

  /**
   * Where the dog stands, as a CSS length.
   *
   * The six columns are `flex-1` with a 6px gap, so a column is
   * (100% - 5*6px)/6 wide and the centre of column i sits that far in,
   * plus i gaps, plus half a column. Done in calc() rather than measured
   * in JS: no resize listener, no layout read, and it is correct on the
   * first paint instead of jumping into place after it.
   */
  const GAP = 6;
  const COUNT = GROOMING_STEPS.length;
  const left = `calc((100% - ${GAP * (COUNT - 1)}px) / ${COUNT} * ${stage.step}`
    + ` + ${GAP * stage.step}px`
    + ` + (100% - ${GAP * (COUNT - 1)}px) / ${COUNT * 2})`;

  return (
    <div className={className} data-testid="groom-progress-wrap">
      {/* The dog walks the bar. Decorative: the <ol> below carries the
          state for a screen reader, and a marker that announced itself
          would read out the current step a second time. */}
      <div className="relative h-5" aria-hidden="true">
        <GroomigoDogMark
          className="absolute bottom-0 h-5 w-5 -translate-x-1/2 motion-safe:transition-[left,color] motion-safe:duration-700 motion-safe:ease-out"
          style={{ left, color: GROOMING_STEPS[stage.step].colour }}
          data-testid="groom-dog"
        />
      </div>
    <ol
      className="flex items-stretch gap-1.5"
      aria-label={`${petName}'s progress`}
      data-testid="groom-progress"
    >
      {GROOMING_STEPS.map((step, idx) => {
        const status = stepStatus(stage, idx);
        const lit = status !== "upcoming";
        return (
          <li
            key={step.key}
            className="flex-1 min-w-0"
            aria-current={status === "current" ? "step" : undefined}
            data-step={step.key}
            data-status={status}
          >
            <div
              className={`h-2 rounded-full transition-colors ${lit ? "" : "bg-muted"} ${
                status === "current" ? "ring-2 ring-offset-1 ring-offset-background" : ""
              }`}
              style={
                lit
                  ? {
                      backgroundColor: step.colour,
                      // A done step is the colour flat; the current one is
                      // the same colour ringed, so it reads as "here" at a
                      // glance without a second hue to decode.
                      ...(status === "current" ? { ["--tw-ring-color" as string]: step.colour } : {}),
                    }
                  : undefined
              }
            />
            <p
              className={`mt-1.5 text-center text-[10px] leading-tight sm:text-[11px] ${
                status === "current" ? "font-semibold" : status === "done" ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}
              style={status === "current" ? { color: step.colour } : undefined}
            >
              {/* Short on a phone, full from sm: up. Same element, so a
                  screen reader is not read two labels for one step. */}
              <span className="sm:hidden">{step.short}</span>
              <span className="hidden sm:inline">{step.label}</span>
            </p>
          </li>
        );
      })}
    </ol>
    </div>
  );
}

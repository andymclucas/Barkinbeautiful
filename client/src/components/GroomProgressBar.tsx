import { clientFacingStage, stepStatus, GROOMING_STEPS } from "@shared/groomingStage";

/**
 * The six-step bar a client sees while their dog is in the salon.
 *
 * Checked-in · Bathing · Drying · Grooming · Ready for pickup · Picked up,
 * which is the layout Andy asked for on 21/10/2026.
 *
 * Extracted from ClientPortal so it has plain props and can be rendered
 * in a test — the portal page itself is 1,000 lines of tRPC and cannot
 * be. The Pet Tracker draws the same six as a vertical list with its own
 * styling; both read their state from `clientFacingStage`, which is
 * where the twelve-to-six collapse and the hiding of the inter-stage
 * queues actually live.
 *
 * A bar rather than a list of times, deliberately: it says where things
 * are up to without promising when they will finish.
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

  return (
    <ol
      className={`flex items-stretch gap-1 ${className}`}
      aria-label={`${petName}'s progress`}
      data-testid="groom-progress"
    >
      {GROOMING_STEPS.map((step, idx) => {
        const status = stepStatus(stage, idx);
        return (
          <li
            key={step.key}
            className="flex-1"
            aria-current={status === "current" ? "step" : undefined}
            data-step={step.key}
            data-status={status}
          >
            <div
              className={`h-1.5 rounded-full ${
                status === "done" ? "bg-primary" : status === "current" ? "bg-primary/60" : "bg-muted"
              }`}
            />
            <p
              className={`mt-1.5 text-[11px] leading-tight ${
                status === "current"
                  ? "font-semibold text-primary"
                  : status === "done"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60"
              }`}
            >
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Choosing between appointments that sit on top of each other.
 *
 * Andy, 05/11/2026, with a photo of three dogs piled up in Ashleigh's
 * 8-10am on a phone: "Need to find a way to be able to see the appts
 * behind the ones over the top. Perhaps when clicking on the top one,
 * it gives the option of the multiple ones that are sitting behind for
 * the staff to click on."
 *
 * Its own component rather than more JSX inside the 5,700-line
 * Calendar page, because plain props with no tRPC and no context is
 * what can actually be rendered in a test — CLAUDE.md §7. The page
 * decides WHEN to open it (only where cards cascade, see the day
 * grid); this only draws the choice.
 */

export type StackedAppointment = {
  id: number;
  /** Already formatted for the salon's timezone by the caller. */
  time: string;
  /** Pet name, or the joined names of a family booking. */
  label: string;
  service: string;
  isCancelled: boolean;
  /** The service colour, for the spine down the left of each row. */
  accent: string;
};

export function AppointmentStackPicker({
  appointments,
  tappedId,
  open,
  onOpenChange,
  onPick,
}: {
  appointments: StackedAppointment[];
  /** Marked in the list, so the tap still feels like it went somewhere. */
  tappedId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {appointments.length} dogs at this time
          </DialogTitle>
          {/* The description, not a loose paragraph: Radix wires it to
              aria-describedby, so a screen reader says why the list
              appeared instead of announcing an unexplained dialog. */}
          <DialogDescription className="text-xs">
            These overlap, so on the board they sit on top of each other. Pick the one you want.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {appointments.map((appt) => {
            const tapped = appt.id === tappedId;
            return (
              <button
                key={appt.id}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted/60 ${tapped ? "border-primary/60 bg-primary/5" : ""}`}
                style={{ borderLeft: `4px solid ${appt.accent}` }}
                onClick={() => onPick(appt.id)}
              >
                <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                  {appt.time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{appt.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {appt.service}
                    {appt.isCancelled ? " · cancelled" : ""}
                  </span>
                </span>
                {tapped && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Tapped
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

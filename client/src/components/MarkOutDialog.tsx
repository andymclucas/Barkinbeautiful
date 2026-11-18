import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SplitPaymentPanel } from "@/components/SplitPaymentPanel";
import { markOutButton } from "@shared/markOutButton";

/**
 * The board's "Mark as Out?" question, with the till in it.
 *
 * It used to carry a "Mark as Paid" tick. The tick recorded nothing —
 * the server never read it — so a dog could be "Paid & OUT" on the board
 * and unpaid everywhere else. Andy, 18/11/2026: put the payment panel
 * here instead. So staff see what is owing and take it the normal way,
 * through the same SplitPaymentPanel the booking form uses; no second
 * way of recording money exists.
 *
 * Marking out never waits on payment. "OUT (payment pending)" is still
 * one press away, which is what the salon needs when a client pays later.
 */
export function MarkOutDialog({ appointmentId, petName, onCancel, onConfirm }: {
  appointmentId: number;
  petName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // The same query the panel below runs, so this adds no request: it is
  // only here to word the button from what is really owing on this dog.
  const { data } = trpc.payments.forBooking.useQuery({ appointmentId });
  const own = data?.appointments.find((row) => row.appointmentId === appointmentId);
  const button = markOutButton(own ? own.outstanding : undefined, own ? own.total : undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mark ${petName} as Out?`}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-bold">Mark {petName} as Out?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Take payment here if it has not been taken yet, then mark the dog as picked up.
          </p>
        </div>

        <SplitPaymentPanel appointmentId={appointmentId} />

        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold text-white transition-colors ${button.pending ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
            onClick={onConfirm}
          >
            {button.label}
          </button>
        </div>
      </div>
    </div>
  );
}

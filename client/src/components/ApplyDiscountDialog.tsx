import { useEffect, useState } from "react";
import { BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISCOUNT_PERCENTS, applyDiscount, fromCents } from "@shared/appointmentDiscount";
import { applyLineDiscount, validateLineDiscount } from "@shared/lineDiscount";

/**
 * Apply a staff discount to an appointment, with a reason.
 *
 * Used from both places a discount is decided: when the booking is made,
 * and at the counter when it is paid. Same component, same rules, so the
 * two cannot drift apart.
 *
 * The reason is mandatory and the Save button stays disabled without one —
 * a discount nobody can explain a month later is the thing this prevents.
 */
export function ApplyDiscountDialog({
  appointmentId,
  grossPrice,
  currentPercent,
  currentReason,
  sessionHasOtherPets,
  onApplied,
  trigger,
}: {
  appointmentId: number;
  /** The pre-discount price, so the preview is honest. */
  grossPrice: string | number | null | undefined;
  currentPercent?: number | null;
  currentReason?: string | null;
  /** Offer "apply to every dog in this booking" only when there are others. */
  sessionHasOtherPets?: boolean;
  onApplied?: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState<number | null>(currentPercent ?? null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(currentReason ?? "");
  const [applyToSession, setApplyToSession] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPercent(currentPercent ?? null);
    setReason(currentReason ?? "");
    setApplyToSession(false);
  }, [open, currentPercent, currentReason]);

  const save = trpc.calendar.setAppointmentDiscount.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.percent === null
          ? "Discount removed"
          : `${result.percent}% applied to ${result.updated.length} appointment${result.updated.length === 1 ? "" : "s"}`,
      );
      setOpen(false);
      onApplied?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const usingAmount = amount.trim() !== "";
  const amountCheck = usingAmount
    ? validateLineDiscount({ kind: "amount", value: amount, reason: reason || "x", gross: grossPrice })
    : null;
  const amountError = amountCheck && !amountCheck.ok ? amountCheck.error : null;
  const preview = usingAmount
    ? applyLineDiscount(grossPrice, amountCheck && amountCheck.ok ? amountCheck.discount : null)
    : applyDiscount(grossPrice, percent as never);
  // A reason is required for either shape — money comes off the bill and
  // nobody can say why a month later otherwise.
  const reasonMissing = (percent !== null || usingAmount) && reason.trim() === "";

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <BadgePercent className="h-3.5 w-3.5" />
            {currentPercent ? `${currentPercent}% off` : "Apply discount"}
          </Button>
        )}
      </span>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Apply a discount</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-1.5">
              <Button
                type="button"
                variant={percent === null ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setPercent(null)}
              >
                None
              </Button>
              {DISCOUNT_PERCENTS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={percent === option ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setPercent(option)}
                >
                  {option}%
                </Button>
              ))}
            </div>

            {/* A flat dollar figure, beside the ladder rather than inside
                it. Andy, 27/10/2026: "plus the overall total if
                required." The ladder is the staff-discount policy and
                stays four fixed steps; this is "take $20 off", which it
                cannot express. Typing here clears the percentage,
                because a line carries one or the other, never both. */}
            <div className="grid gap-1.5">
              <Label htmlFor="discount-amount">or take a set amount off</Label>
              <Input
                id="discount-amount"
                placeholder="$0.00"
                inputMode="decimal"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); if (e.target.value.trim()) setPercent(null); }}
              />
              {amountError && <p className="text-xs text-red-600 dark:text-red-400">{amountError}</p>}
            </div>

            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Full price</span><span>${fromCents(preview.grossCents)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>−${fromCents(preview.discountCents)}</span></div>
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Client pays</span><span>${fromCents(preview.netCents)}</span></div>
            </div>

            {(percent !== null || usingAmount) && (
              <div className="grid gap-1.5">
                <Label htmlFor="discount-reason">Reason <span className="text-red-600">*</span></Label>
                <Input
                  id="discount-reason"
                  value={reason}
                  maxLength={200}
                  placeholder="e.g. first visit, staff family, service issue"
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Recorded against your name, and shown on the appointment.</p>
              </div>
            )}

            {sessionHasOtherPets && percent !== null && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={applyToSession}
                  onChange={(e) => setApplyToSession(e.target.checked)}
                />
                <span>Apply to every dog in this booking <span className="block text-xs text-muted-foreground">Each dog is discounted by {percent}% of its own price.</span></span>
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={save.isPending || reasonMissing || Boolean(amountError)}
              title={reasonMissing ? "Please say why this discount is being applied" : undefined}
              onClick={() => save.mutate({
                appointmentId,
                // One or the other reaches the server, never both.
                percent: usingAmount ? null : percent,
                amount: usingAmount && amountCheck?.ok && amountCheck.discount?.kind === "amount"
                  ? amountCheck.discount.value
                  : null,
                reason: reason.trim() || null,
                applyToSession,
              })}
            >
              {save.isPending ? "Saving…"
                : percent === null && !usingAmount ? "Remove discount"
                : "Apply discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

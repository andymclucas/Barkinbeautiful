import { HeartCrack, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PassingReview } from "@shared/petPassingReview";

/**
 * What to do about the money after a dog dies.
 *
 * Andy, 22/10/2026, after a client's dog died: the system should raise
 * these questions rather than wait for somebody to remember them. Kayla
 * Fellingham had a $30-a-week two-dog plan whose two dogs had both
 * died, and nothing anywhere said so.
 *
 * **It proposes; it never decides.** There is no default action and no
 * pre-selected option. "Stop the membership" is the wrong instinct
 * about half the time — the surviving dog's grooms are often prepaid
 * through the same plan — and this is a screen somebody opens minutes
 * after being told a dog died. Closing it changes nothing, and the bell
 * row keeps the question alive.
 */
export function PassingReviewDialog({
  review,
  clientId,
  onClose,
  onMove,
  onCancelPlan,
  busy = false,
}: {
  review: PassingReview | null;
  clientId: number;
  onClose: () => void;
  onMove: (membershipId: number, toPetId: number) => void;
  onCancelPlan: (membershipId: number) => void;
  busy?: boolean;
}) {
  const open = Boolean(review && !review.isEmpty);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartCrack className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            {review?.petName} — what about the membership?
          </DialogTitle>
        </DialogHeader>

        {review && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This household still has {review.memberships.length} active membership
              {review.memberships.length === 1 ? "" : "s"}
              {review.weeklyTotal > 0 && <> worth <strong>${review.weeklyTotal.toFixed(2)} a week</strong></>}.
              Nothing changes until you choose.
            </p>

            {review.memberships.map((row) => (
              <div key={row.membership.id} className="rounded-lg border p-3" data-testid="passing-membership">
                <p className="text-sm font-semibold">{row.membership.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.membership.pricePerCycle && `$${Number(row.membership.pricePerCycle).toFixed(2)}`}
                  {row.membership.billingCycleWeeks === 1 ? " a week" : ` every ${row.membership.billingCycleWeeks} weeks`}
                  {!row.attachedToDeparted && " · recorded against another dog"}
                </p>

                {row.attachedToDeparted ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.movableTo.map((pet) => (
                      <Button
                        key={pet.id} size="sm" variant="outline" disabled={busy}
                        className="gap-1.5 text-xs"
                        onClick={() => onMove(row.membership.id, pet.id)}
                      >
                        <ArrowRight className="h-3 w-3" /> Move to {pet.name}
                      </Button>
                    ))}
                    <Button
                      size="sm" variant="outline" disabled={busy}
                      className="border-red-200 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
                      onClick={() => onCancelPlan(row.membership.id)}
                    >
                      Stop this membership
                    </Button>
                    {row.movableTo.length === 0 && (
                      <p className="w-full text-xs text-muted-foreground">
                        No surviving dog is in the same weight band, so this plan cannot simply move.
                      </p>
                    )}
                  </div>
                ) : (
                  /* The MoeGo import hung every plan off one pet, so a
                     plan for the dog that died is often recorded against
                     a sibling. Changing it there is a deliberate trip to
                     the membership rather than a button here, because
                     the system cannot tell which dog it was really for. */
                  <p className="mt-2 text-xs text-muted-foreground">
                    This plan is recorded against a different dog, so it may or may not be for{" "}
                    {review.petName}. Open the client's memberships to change it.
                  </p>
                )}
              </div>
            ))}

            <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Open the client's memberships
            </Link>
          </div>
        )}

        <DialogFooter>
          {/* Deliberately not "Cancel" — nothing here has been started,
              and the word next to a bereavement dialog reads wrong. */}
          <Button variant="outline" onClick={onClose}>Decide later</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

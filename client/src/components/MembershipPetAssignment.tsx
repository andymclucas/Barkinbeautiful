import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dog } from "lucide-react";
import { toast } from "sonner";

/**
 * Put the rest of a household's dogs onto the plan that already pays
 * for them.
 *
 * The salon prices a household on one fee and writes the count into the
 * plan's name — "Silver+ (x2)" at $58 a week is two dogs, not two
 * memberships at $58. Only the dog the plan names was ever recorded, so
 * every other dog in those 27 households looks like a paying client:
 * their grooms are counted as chargeable, their share of the
 * subscription is missing from the membership figure, and their
 * bookings are among the 78 that sit unlinked.
 *
 * The plan name says how many dogs to expect and nothing more. Which
 * dog is on the plan is a question only somebody at the salon can
 * answer, so this asks rather than guessing — the same line the rest of
 * the codebase draws around that name.
 */
export function MembershipPetAssignment() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.memberships.listPetAssignments.useQuery({});
  const [picked, setPicked] = useState<Record<number, Set<number>>>({});

  const save = trpc.memberships.setCoveredPets.useMutation({
    onSuccess: (result) => {
      toast.success(`Saved — the plan now covers ${result.covered} dog${result.covered === 1 ? "" : "s"}`);
      utils.memberships.listPetAssignments.invalidate();
      utils.memberships.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) return null;
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Every membership covers as many dogs as its name says. Nothing to assign.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Dog className="h-4 w-4 text-primary" />
          Memberships missing dogs
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            {rows.length}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          These plans are priced for more dogs than they currently cover. Tick the ones each
          fee pays for — their grooms then count as covered instead of chargeable.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.map((row) => {
          // The plan's own dog is always on it and is not a choice, so
          // it is shown as already ticked and cannot be removed here.
          const already = new Set(row.coveredPetIds);
          const selection = picked[row.membershipId] ?? new Set(row.coveredPetIds);
          const toggle = (petId: number) => {
            const next = new Set(selection);
            if (next.has(petId)) next.delete(petId);
            else next.add(petId);
            setPicked((c) => ({ ...c, [row.membershipId]: next }));
          };

          return (
            <div key={row.membershipId} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{row.clientName || "Unnamed client"}</p>
                  <p className="text-xs text-muted-foreground">{row.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  ${row.pricePerCycle}/wk &middot; {row.missing} more dog{row.missing === 1 ? "" : "s"} expected
                </p>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.householdPets.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    This client has no other dogs on file, so there is nothing to add.
                  </p>
                )}
                {row.householdPets.map((pet) => {
                  const isPrimary = pet.id === row.primaryPetId;
                  const on = selection.has(pet.id);
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      disabled={isPrimary}
                      onClick={() => toggle(pet.id)}
                      title={isPrimary ? "The dog this plan is filed under — always covered" : undefined}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        on
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "border-border hover:bg-accent"
                      } ${isPrimary ? "cursor-default opacity-80" : ""}`}
                    >
                      {pet.name}
                      {pet.breed ? <span className="font-normal opacity-70"> · {pet.breed}</span> : null}
                      {isPrimary ? <span className="ml-1 opacity-60">(named)</span> : null}
                    </button>
                  );
                })}
              </div>

              {row.householdPets.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={save.isPending || sameSet(selection, already)}
                    onClick={() => save.mutate({
                      membershipId: row.membershipId,
                      petIds: Array.from(selection),
                    })}
                  >
                    {save.isPending ? "Saving…" : `Cover ${selection.size} dog${selection.size === 1 ? "" : "s"}`}
                  </Button>
                  {!sameSet(selection, already) && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setPicked((c) => ({ ...c, [row.membershipId]: new Set(row.coveredPetIds) }))}
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Whether the ticks still match what is saved, so Save can be disabled. */
function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of Array.from(a)) if (!b.has(value)) return false;
  return true;
}

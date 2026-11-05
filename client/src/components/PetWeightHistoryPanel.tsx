import { trpc } from "@/lib/trpc";
import { PetWeightChart } from "@/components/PetWeightChart";

/**
 * The fetching half of the weight history, kept apart from the drawing
 * half so PetWeightChart stays plain-props and testable.
 *
 * Only asks the server once somebody opens it. A client card can carry
 * half a dozen dogs, and six history queries on every page load is the
 * shape of problem that took the salon down on 05/11/2026.
 */
export function PetWeightHistoryPanel({
  petId,
  petName,
  open,
}: {
  petId: number;
  petName?: string | null;
  open: boolean;
}) {
  const { data, isLoading } = trpc.pets.weightHistory.useQuery(
    { petId },
    { enabled: open },
  );

  if (!open) return null;
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading weight history…</p>;
  }
  return <PetWeightChart entries={data?.entries ?? []} petName={petName} />;
}

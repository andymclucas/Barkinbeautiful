import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SizeChangePriceReview } from "@/components/SizeChangePriceReview";
import { sizeBandLabel, type DogSizeBand } from "@shared/dogSizeBand";

/**
 * The price prompt that follows a dog changing size band.
 *
 * Opened by the client page straight after a weight or a size was saved
 * and the server said the band moved. It asks the server what the dog has
 * booked and what each booking could cost at the new size, and hands that
 * to SizeChangePriceReview. A dog with nothing booked and no membership
 * has nothing to ask about, so the box never opens for it.
 *
 * Prices are saved through calendar.updateDetails, one booking at a time
 * — the same call the booking form's price box makes, so a price changed
 * here behaves exactly like one changed there.
 */
export function SizeChangePriceDialog({ petId, onClose }: { petId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const review = trpc.pets.sizePriceReview.useQuery(
    { petId: petId ?? 0 },
    { enabled: petId !== null, staleTime: 0, gcTime: 0, retry: false },
  );
  const updateDetails = trpc.calendar.updateDetails.useMutation();
  const [saving, setSaving] = useState(false);

  const data = petId !== null && !review.isFetching ? review.data : undefined;
  const nothingToAsk = Boolean(data) && data!.bookings.length === 0 && !data!.membershipName;

  // Nothing booked and no membership, or the check itself failed: close
  // quietly. The weight was saved either way; this box is only a prompt.
  useEffect(() => {
    if (petId !== null && (nothingToAsk || review.isError)) onClose();
  }, [petId, nothingToAsk, review.isError, onClose]);

  const apply = async (changes: { appointmentId: number; price: string }[]) => {
    setSaving(true);
    let saved = 0;
    try {
      for (const change of changes) {
        await updateDetails.mutateAsync({ appointmentId: change.appointmentId, price: change.price });
        saved += 1;
      }
      toast.success(saved === 1 ? "1 booking price updated" : `${saved} booking prices updated`);
      onClose();
    } catch (error) {
      // Weighing a dog and changing a booking's price are different
      // permissions. Somebody who can do the first and not the second is
      // told that in words, not "0 of 2 prices were updated".
      const forbidden = (error as { data?: { code?: string } } | null)?.data?.code === "FORBIDDEN";
      if (forbidden && saved === 0) {
        toast.error("Your login can't change booking prices. The weight was saved; ask an owner to check the prices.");
        onClose();
      } else {
        toast.error(
          `${saved} of ${changes.length} prices were updated before something went wrong: ${error instanceof Error ? error.message : "please try again"}`,
        );
      }
    } finally {
      setSaving(false);
      utils.clients.getProfile.invalidate();
      utils.calendar.invalidate();
      // So a box left open after a part-failure shows what was saved.
      utils.pets.sizePriceReview.invalidate();
    }
  };

  const open = petId !== null && Boolean(data) && !nothingToAsk;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Check {data?.pet.name ?? "this dog"}&rsquo;s prices</DialogTitle></DialogHeader>
        {data && (
          <SizeChangePriceReview
            petName={data.pet.name}
            sizeLabel={data.pet.sizeBand ? sizeBandLabel(data.pet.sizeBand as DogSizeBand) : null}
            membershipName={data.membershipName}
            bookings={data.bookings}
            saving={saving}
            onApply={apply}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

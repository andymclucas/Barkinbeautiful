import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dog, Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BreedInput } from "@/components/BreedInput";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SIZE_BAND_IDS, sizeBandLabel, type DogSizeBand } from "@shared/dogSizeBand";

/**
 * Add a dog, or correct one that is already there.
 *
 * Andy, 23/10/2026: "Also need a button to add, edit or delete a dog."
 * Until now a pet card could change weight, size, codes and preferred
 * groomer — but not its NAME or BREED, and there was no way to remove
 * one at all.
 *
 * Delete is deliberately not in here as a primary action. It sits at the
 * bottom of the edit form, it is only offered on a dog with no history,
 * and the server refuses anything else — see shared/petDeletion.ts. The
 * reason it exists is that without it staff retired duplicates by
 * marking them dead, and five of seven "departed" dogs on 19/10/2026
 * were duplicates rather than deaths.
 */
export type EditablePet = {
  id: number;
  name: string;
  breed: string | null;
  sizeBand?: string | null;
};

export function PetEditorDialog({
  open,
  pet,
  clientId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null to add a new dog. */
  pet: EditablePet | null;
  clientId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [sizeBand, setSizeBand] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [blocker, setBlocker] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(pet?.name ?? "");
    setBreed(pet?.breed ?? "");
    setSizeBand(pet?.sizeBand ?? "");
    setConfirmingDelete(false);
    setBlocker(null);
  }, [open, pet]);

  const done = (message: string) => { toast.success(message); onSaved(); onClose(); };

  const create = trpc.pets.create.useMutation({
    onSuccess: () => done(`${name.trim()} added`),
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.pets.updateDetails.useMutation({
    onSuccess: () => done(`${name.trim()} updated`),
    onError: (e) => toast.error(e.message),
  });
  const updateBand = trpc.pets.updateSizeBand.useMutation();
  const remove = trpc.pets.remove.useMutation({
    onSuccess: (r) => {
      // check: true answers without deleting, so the warning is accurate
      // rather than a guess made in the browser.
      if (r.checked) {
        if (r.verdict.canDelete) setConfirmingDelete(true);
        else setBlocker(r.verdict.reason);
        return;
      }
      done(`${r.petName} deleted`);
    },
    onError: (e) => toast.error(e.message),
  });

  const busy = create.isPending || update.isPending || remove.isPending;
  const ready = name.trim() !== "";

  const save = async () => {
    if (!ready || busy) return;
    if (pet) {
      if ((pet.sizeBand ?? "") !== sizeBand) {
        await updateBand.mutateAsync({ petId: pet.id, sizeBand: sizeBand || null });
      }
      update.mutate({ petId: pet.id, name: name.trim(), breed: breed.trim() || null });
    } else {
      create.mutate({
        clientId,
        name: name.trim(),
        ...(breed.trim() ? { breed: breed.trim() } : {}),
        ...(sizeBand ? { sizeBand } : {}),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dog className="h-5 w-5 text-primary" />
            {pet ? `Edit ${pet.name}` : "Add a dog"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pe-name">Name *</Label>
            <Input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe-breed">Breed</Label>
            <BreedInput id="pe-breed" value={breed} onChange={setBreed} />
          </div>
          <div className="space-y-1.5">
            <Label>Size</Label>
            <Select value={sizeBand} onValueChange={setSizeBand}>
              <SelectTrigger aria-label="Size"><SelectValue placeholder="Sets the price" /></SelectTrigger>
              <SelectContent>
                {SIZE_BAND_IDS.map((band) => (
                  <SelectItem key={band} value={band}>{sizeBandLabel(band as DogSizeBand)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pet && (
            <div className="border-t pt-3">
              {blocker ? (
                <p className="text-xs text-amber-800 dark:text-amber-300" data-testid="delete-blocked">{blocker}</p>
              ) : confirmingDelete ? (
                <div className="space-y-2" data-testid="delete-confirm">
                  <p className="text-xs font-medium">
                    Delete {pet.name} permanently? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                      Keep
                    </Button>
                    <Button
                      size="sm" variant="destructive" disabled={busy}
                      onClick={() => remove.mutate({ petId: pet.id, check: false })}
                    >
                      Delete {pet.name}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm" variant="ghost" disabled={busy}
                  className="gap-1.5 px-0 text-xs text-red-700 hover:text-red-800 dark:text-red-300"
                  onClick={() => remove.mutate({ petId: pet.id, check: true })}
                  data-testid="delete-pet"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete this dog
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={!ready || busy} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pet ? "Save" : "Add dog"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

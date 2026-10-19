import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { SIZE_BAND_IDS, sizeBandLabel, type DogSizeBand } from "@shared/dogSizeBand";

/**
 * Add a client without leaving the booking.
 *
 * Andy, 13/10/2026: "Need a 'New Client' button featured when booking a new
 * appointment." Until now the only way was to go to the Clients page, add
 * them, come back and start the booking again — losing the date and time
 * already chosen. On the phone with somebody new, that is the whole call.
 *
 * Deliberately the shortest form that produces a bookable client: a name, a
 * dog, and the size that prices the groom. Everything else — email, address,
 * breed, notes — can be filled in later from the client's profile, and
 * asking for it here would make the fast path slow.
 *
 * The size band is the one optional field worth asking for, because it is
 * what the price comes from and the person is on the phone looking at the
 * dog's owner. 10,372 of 12,552 dogs on file have no weight; this is the
 * cheapest moment there will ever be to capture the size.
 */
export function NewClientQuickAdd({
  onCreated,
  onCancel,
}: {
  onCreated: (created: { clientId: number; petId: number; petName: string }) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [petName, setPetName] = useState("");
  const [sizeBand, setSizeBand] = useState("");
  const [saving, setSaving] = useState(false);

  const createClient = trpc.clients.create.useMutation();
  const createPet = trpc.pets.create.useMutation();

  const ready = firstName.trim() !== "" && lastName.trim() !== "" && petName.trim() !== "";

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const client = await createClient.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      // The pet is created second and separately, so a failure here leaves a
      // real client on file rather than rolling both back. Staff can add the
      // dog from the profile; losing the client they just took details for
      // would be worse.
      const pet = await createPet.mutateAsync({
        clientId: client.id,
        name: petName.trim(),
        ...(sizeBand ? { sizeBand } : {}),
      });
      toast.success(`${firstName.trim()} ${lastName.trim()} added`, {
        description: `${petName.trim()} is ready to book.`,
      });
      onCreated({ clientId: client.id, petId: pet.id, petName: petName.trim() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5 p-3" data-testid="new-client-quick-add">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <UserPlus className="h-3.5 w-3.5 text-primary" /> New client
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor="qa-first-name">First name *</Label>
          <Input id="qa-first-name" className="h-8 text-xs" value={firstName} onChange={e => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor="qa-last-name">Last name *</Label>
          <Input id="qa-last-name" className="h-8 text-xs" value={lastName} onChange={e => setLastName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]" htmlFor="qa-phone">Phone</Label>
        <Input id="qa-phone" className="h-8 text-xs" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor="qa-pet-name">Dog's name *</Label>
          <Input id="qa-pet-name" className="h-8 text-xs" value={petName} onChange={e => setPetName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor="qa-size">Size</Label>
          <Select value={sizeBand} onValueChange={setSizeBand}>
            <SelectTrigger id="qa-size" aria-label="Size" className="h-8 text-xs"><SelectValue placeholder="For the price" /></SelectTrigger>
            <SelectContent>
              {SIZE_BAND_IDS.map(band => (
                <SelectItem key={band} value={band}>{sizeBandLabel(band as DogSizeBand)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Email, breed and notes can be added from their profile later.
      </p>

      <div className="flex justify-end gap-2 pt-0.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={!ready || saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Add and book
        </Button>
      </div>
    </div>
  );
}

export default NewClientQuickAdd;

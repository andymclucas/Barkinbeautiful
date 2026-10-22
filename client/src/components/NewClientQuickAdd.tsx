import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BreedInput } from "@/components/BreedInput";
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
 * Short, but not as short as it was. Lauren, 23/10/2026: "tried to add
 * new client with 2 dogs. it only lets me add 1, still no breed area."
 *
 * Both were deliberate omissions and both were wrong. A one-dog form is
 * not the fast path in a salon where multi-dog families are routine — it
 * is a form you abandon halfway and finish on the Clients page, which is
 * the thing this exists to avoid. And breed is asked for on the phone
 * anyway, so not capturing it just means typing it twice.
 *
 * The size band stays the one field worth pressing for, because it is
 * what the price comes from and the person is on the phone looking at
 * the dog's owner. 10,372 of 12,552 dogs on file have no weight; this is
 * the cheapest moment there will ever be to capture it.
 */
export function NewClientQuickAdd({
  onCreated,
  onCancel,
}: {
  /**
   * The NAME comes back as well as the ids. The caller shows the client
   * in a picker whose options come from a SEARCH query, and a client
   * created a second ago is not in those results yet — so the trigger
   * fell through to "Client #420002" (Lauren, 23/10/2026). Handing the
   * name over means the caller never has to look it up.
   */
  onCreated: (created: {
    clientId: number;
    firstName: string;
    lastName: string;
    petIds: number[];
    petNames: string[];
  }) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  type DogRow = { name: string; breed: string; sizeBand: string };
  const [dogs, setDogs] = useState<DogRow[]>([{ name: "", breed: "", sizeBand: "" }]);
  const [saving, setSaving] = useState(false);

  const setDog = (index: number, patch: Partial<DogRow>) =>
    setDogs(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const namedDogs = dogs.filter(d => d.name.trim() !== "");

  const createClient = trpc.clients.create.useMutation();
  const createPet = trpc.pets.create.useMutation();

  const ready = firstName.trim() !== "" && lastName.trim() !== "" && namedDogs.length > 0;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const client = await createClient.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      // The dogs are created separately, so a failure part-way leaves a
      // real client and whatever dogs did save, rather than rolling it all
      // back. Staff can add the rest from the profile; losing the details
      // they just took on the phone would be worse.
      //
      // Sequential rather than Promise.all: these land in the order typed,
      // and the first dog is the one the booking selects.
      const created: { id: number; name: string }[] = [];
      for (const dog of namedDogs) {
        const pet = await createPet.mutateAsync({
          clientId: client.id,
          name: dog.name.trim(),
          ...(dog.breed.trim() ? { breed: dog.breed.trim() } : {}),
          ...(dog.sizeBand ? { sizeBand: dog.sizeBand } : {}),
        });
        created.push({ id: pet.id, name: dog.name.trim() });
      }
      toast.success(`${firstName.trim()} ${lastName.trim()} added`, {
        description: created.length === 1
          ? `${created[0].name} is ready to book.`
          : `${created.map(d => d.name).join(", ")} are ready to book.`,
      });
      onCreated({
        clientId: client.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        petIds: created.map(d => d.id),
        petNames: created.map(d => d.name),
      });
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

      <div className="space-y-2">
        {dogs.map((dog, i) => (
          <div key={i} className="space-y-1.5 rounded-md border p-2" data-testid="qa-dog">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">{dogs.length === 1 ? "Dog *" : `Dog ${i + 1}${i === 0 ? " *" : ""}`}</Label>
              {dogs.length > 1 && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-red-600"
                  onClick={() => setDogs(rows => rows.filter((_, x) => x !== i))}
                  aria-label={`Remove dog ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                aria-label={`Dog ${i + 1} name`}
                placeholder="Name"
                className="h-8 text-xs"
                value={dog.name}
                onChange={e => setDog(i, { name: e.target.value })}
              />
              {/* The salon's own breed list, so a new dog is typed once
                  and matches the 638 already on file. */}
              <BreedInput
                className="h-8 text-xs"
                placeholder="Breed"
                value={dog.breed}
                onChange={v => setDog(i, { breed: v })}
              />
            </div>
            <Select value={dog.sizeBand} onValueChange={v => setDog(i, { sizeBand: v })}>
              <SelectTrigger aria-label={`Dog ${i + 1} size`} className="h-8 text-xs">
                <SelectValue placeholder="Size — sets the price" />
              </SelectTrigger>
              <SelectContent>
                {SIZE_BAND_IDS.map(band => (
                  <SelectItem key={band} value={band}>{sizeBandLabel(band as DogSizeBand)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <Button
          type="button" size="sm" variant="outline"
          className="h-7 w-full gap-1 text-xs"
          onClick={() => setDogs(rows => [...rows, { name: "", breed: "", sizeBand: "" }])}
          data-testid="qa-add-dog"
        >
          <Plus className="h-3 w-3" /> Add another dog
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Email, address and notes can be added from their profile later.
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

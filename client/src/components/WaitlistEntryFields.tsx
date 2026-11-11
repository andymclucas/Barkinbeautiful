import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/DateField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

/**
 * What the salon asks a client who wants a cancellation.
 *
 * Extracted so there is ONE of it. Andy, 04/11/2026: "Add a quick
 * action of 'add to waitlist' option" — on the client page, where the
 * client is already known, next to the panel on the calendar that has
 * asked the same four questions since the waitlist was built. Two
 * copies of a form whose fields feed one procedure is exactly the
 * duplication CLAUDE.md §10 says drifts, and the one that drifts here
 * would quietly stop matching the offers.
 *
 * The CLIENT is not asked for here. The calendar's panel searches for
 * one and the client page already has one, and that difference is the
 * only reason the two screens are not the same component.
 */

/** Today and sixty days out, as YYYY-MM-DD in Brisbane. */
export function defaultWaitlistWindow() {
  const key = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000)
      .toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  return { earliestDate: key(0), latestDate: key(60) };
}

export type WaitlistFields = {
  earliestDate: string;
  latestDate: string;
  timeOfDay: string;
  staffId: string;
  note: string;
};

export const emptyWaitlistFields = (): WaitlistFields => ({
  ...defaultWaitlistWindow(),
  timeOfDay: "any",
  staffId: "",
  note: "",
});

export function WaitlistEntryFields({
  value, onChange,
}: {
  value: WaitlistFields;
  onChange: (next: WaitlistFields) => void;
}) {
  const groomers = trpc.staff.listOperational.useQuery({});
  const set = (patch: Partial<WaitlistFields>) => onChange({ ...value, ...patch });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">From</Label>
          <DateField className="mt-1 h-8" value={value.earliestDate}
            onChange={next => set({ earliestDate: next })} />
        </div>
        <div>
          <Label className="text-xs">Until</Label>
          <DateField className="mt-1 h-8" value={value.latestDate}
            onChange={next => set({ latestDate: next })} />
        </div>
        <div>
          <Label className="text-xs">Time of day</Label>
          <Select value={value.timeOfDay} onValueChange={(v) => set({ timeOfDay: v })}>
            <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="morning">Mornings</SelectItem>
              <SelectItem value="afternoon">Afternoons</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Groomer</Label>
          <Select value={value.staffId} onValueChange={(v) => set({ staffId: v })}>
            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="No preference" /></SelectTrigger>
            <SelectContent>
              {groomers.data?.map((g: any) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Input className="mt-3 h-8" value={value.note} maxLength={500}
        placeholder="Anything else they said — e.g. not Tuesdays, needs a late pickup"
        onChange={(e) => set({ note: e.target.value })} />
    </>
  );
}

/** The shape waitlist.join wants, from what the form collected. */
export function waitlistJoinInput(clientId: number, petIds: number | readonly number[], f: WaitlistFields) {
  return {
    clientId,
    // Every dog waiting for the same slot (11/11/2026). One entry, one
    // offer, one booking for the household.
    petIds: Array.isArray(petIds) ? [...petIds] : [petIds as number],
    earliestDate: f.earliestDate,
    latestDate: f.latestDate,
    timeOfDay: f.timeOfDay as "any" | "morning" | "afternoon",
    preferredStaffId: f.staffId ? Number(f.staffId) : undefined,
    note: f.note.trim() || undefined,
  };
}

/**
 * Which of the client's dogs are waiting. Tick boxes, not a dropdown:
 * Andy, 11/11/2026, "Only one dog able to be added to the waitlist" —
 * a household's dogs usually come together and wait for one slot.
 */
export function WaitlistDogChoice({
  pets, value, onChange,
}: {
  pets: { id: number; name: string }[];
  value: readonly number[];
  onChange: (next: number[]) => void;
}) {
  const chosen = new Set(value);
  return (
    <fieldset>
      <legend className="text-xs font-medium">Dogs</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {pets.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={chosen.has(p.id)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(p.id); else next.delete(p.id);
                // Keep the order the dogs are listed in, so the first
                // ticked is not whichever was clicked first.
                onChange(pets.map((x) => x.id).filter((id) => next.has(id)));
              }}
            />
            {p.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The whole thing for a client who is already known: pick the dogs, set
 * the window, add them.
 */
export function AddKnownClientToWaitlist({
  clientId, pets, onAdded,
}: {
  clientId: number;
  /** Active dogs only — a departed dog cannot wait for a cancellation. */
  pets: { id: number; name: string }[];
  onAdded?: () => void;
}) {
  const utils = trpc.useUtils();
  // One dog is chosen for you; with several, nothing is ticked until
  // someone says which — the wrong dog on the list is worse than a click.
  const [petIds, setPetIds] = useState<number[]>(pets.length === 1 ? [pets[0].id] : []);
  const [form, setForm] = useState<WaitlistFields>(emptyWaitlistFields());

  const join = trpc.waitlist.join.useMutation({
    onSuccess: (r: any) => {
      toast.success(`${r.petName ?? "They"} added to the waitlist`);
      utils.waitlist.listEntries.invalidate();
      setForm(emptyWaitlistFields());
      onAdded?.();
    },
    onError: (e) => toast.error(e.message),
  });

  if (pets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This client has no active dogs, so there is nothing to wait for a cancellation with.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Skipped when there is only one dog — asking which of one is
          a click for nothing. */}
      {pets.length > 1 && <WaitlistDogChoice pets={pets} value={petIds} onChange={setPetIds} />}
      <WaitlistEntryFields value={form} onChange={setForm} />
      <Button size="sm" disabled={petIds.length === 0 || join.isPending}
        onClick={() => join.mutate(waitlistJoinInput(clientId, petIds, form))}>
        {join.isPending ? "Adding…" : "Add to waitlist"}
      </Button>
    </div>
  );
}

/**
 * Change an entry somebody is already on, rather than removing and
 * re-adding them.
 *
 * Andy, 05/11/2026: "If they have been added and anything changes, give
 * the function to edit waitlist options."
 *
 * Delete-and-re-add was the only way before this, and it loses the
 * created_at that rankMatches orders offers by — so a client who
 * widened their dates by one day went to the back of the queue behind
 * people who asked after them.
 */
export function EditWaitlistEntry({
  entry, pets, onSaved,
}: {
  entry: {
    id: number;
    petName: string;
    /** The dogs on the entry now. */
    petIds?: number[];
    earliestDate: string;
    latestDate: string;
    timeOfDay: string;
    preferredStaffId: number | null;
    note: string | null;
  };
  /**
   * The client's dogs to choose from (Andy, 11/11/2026: "add dog editing
   * to the waitlist"). Omitted, or one dog, and the dogs are not offered
   * for change. Editing keeps the entry's place in the queue, which
   * removing and re-adding would lose.
   */
  pets?: { id: number; name: string }[];
  onSaved?: () => void;
}) {
  const utils = trpc.useUtils();
  const canChooseDogs = (pets?.length ?? 0) > 1;
  const [petIds, setPetIds] = useState<number[]>(entry.petIds ?? []);
  const [form, setForm] = useState<WaitlistFields>({
    earliestDate: entry.earliestDate,
    latestDate: entry.latestDate,
    timeOfDay: entry.timeOfDay,
    staffId: entry.preferredStaffId ? String(entry.preferredStaffId) : "",
    note: entry.note ?? "",
  });

  const update = trpc.waitlist.update.useMutation({
    onSuccess: () => {
      toast.success(`${entry.petName}'s waitlist entry updated`);
      utils.waitlist.listEntries.invalidate();
      onSaved?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.waitlist.remove.useMutation({
    onSuccess: () => {
      toast.success(`${entry.petName} taken off the waitlist`);
      utils.waitlist.listEntries.invalidate();
      onSaved?.();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canChooseDogs && <WaitlistDogChoice pets={pets!} value={petIds} onChange={setPetIds} />}
      <WaitlistEntryFields value={form} onChange={setForm} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={update.isPending || (canChooseDogs && petIds.length === 0)}
          onClick={() => update.mutate({
            entryId: entry.id,
            ...(canChooseDogs ? { petIds } : {}),
            earliestDate: form.earliestDate,
            latestDate: form.latestDate,
            timeOfDay: form.timeOfDay as "any" | "morning" | "afternoon",
            preferredStaffId: form.staffId ? Number(form.staffId) : null,
            note: form.note.trim() || null,
          })}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {/* Taking them off is the other thing somebody opens this to do,
            and sending them to the calendar's waitlist panel for it is a
            trip across the app for one click. */}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate({ entryId: entry.id })}
        >
          {remove.isPending ? "Removing…" : "Take off the waitlist"}
        </Button>
      </div>
    </div>
  );
}

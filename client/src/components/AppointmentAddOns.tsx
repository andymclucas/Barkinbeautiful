import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { addOnRequiresManualPrice, addOnsTotal, addOnTargets, describeAddOnWrite } from "@shared/appointmentAddOns";
import { applyLineDiscount, discountFromColumns, describeLineDiscount, validateLineDiscount } from "@shared/lineDiscount";

/**
 * The extras done on a dog, recorded against the appointment.
 *
 * The salon has always had a priced add-on catalogue — glands, teeth,
 * flea rinse, a de-matt on an overgrown coat — but nothing recorded which
 * ones were actually done, so the invoice was one line for the groom and
 * the extras were either lost or buried in a single number the client
 * could not break down.
 *
 * Adding one here puts a line on the invoice. Prices are copied from the
 * catalogue at that moment, so a price rise next year does not reach back
 * and change what this client was charged today.
 */
export type AddOnSibling = { appointmentId: number; petName: string };

export function AppointmentAddOns({ appointmentId, petName, siblings = [] }: {
  appointmentId: number;
  /** The dog this box belongs to. Omitted when it is the only dog. */
  petName?: string | null;
  /** The other dogs on the same booking, for "add to all". */
  siblings?: readonly AddOnSibling[];
}) {
  const utils = trpc.useUtils();
  const { data: catalogue } = trpc.appointmentAddOns.catalogue.useQuery({});
  const { data, isLoading } = trpc.appointmentAddOns.list.useQuery({ appointmentId });

  const { data: staffList } = trpc.staff.listOperational.useQuery({});
  const [editing, setEditing] = useState<number | null>(null);
  const [picked, setPicked] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  /* Lauren, 29/10/2026: a teeth clean on a two-dog booking had to be
     added twice, from two different dialogs. Most extras done on a
     family are done on all of them, so this defaults ON when there is
     more than one dog — but the button says how many it will charge
     before it is pressed, because each one is an invoice line. */
  const [applyToAll, setApplyToAll] = useState(true);

  const refresh = () => {
    /* No input: an "add to all" writes to the siblings' lists too, and
       those boxes are mounted right beside this one. */
    void utils.appointmentAddOns.list.invalidate();
    void utils.calendar.invalidate();
  };

  /* No onSuccess toast: an "add to all" fires this once per dog, and
     three toasts for one press reads as three mistakes. The call sites
     below report once, for however many dogs they wrote to. */
  const addMutation = trpc.appointmentAddOns.add.useMutation();
  const removeMutation = trpc.appointmentAddOns.remove.useMutation({
    onSuccess: () => { toast.success("Add-on removed"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  const targets = addOnTargets(
    { appointmentId, petName: petName ?? "this dog" }, siblings, applyToAll,
  );

  /**
   * Add the chosen extra to every dog it is meant for.
   *
   * allSettled, not all: these are separate invoice lines on separate
   * appointments, so a failure on the second dog does NOT undo the
   * first. Saying "added" after a partial write would leave somebody
   * under-charged with nothing on screen to say so.
   */
  const handleAdd = async () => {
    const payload = {
      pricingServiceId: Number(picked),
      quantity: Math.max(1, Math.min(20, parseInt(quantity) || 1)),
      ...(needsPrice ? { unitPrice: parseFloat(manualPrice) } : {}),
    };
    const results = await Promise.allSettled(
      targets.map(t => addMutation.mutateAsync({ appointmentId: t.appointmentId, ...payload })),
    );

    const done = results.filter(r => r.status === "fulfilled");
    const failed = results
      .map((r, i) => ({ r, dog: targets[i].petName }))
      .filter(({ r }) => r.status === "rejected");
    const name = done.length > 0
      ? (done[0] as PromiseFulfilledResult<{ name: string; unitPrice: string }>).value.name
      : chosen?.name ?? "Add-on";

    if (done.length > 0) {
      toast.success(
        describeAddOnWrite({ name, attempted: targets.length, succeeded: done.length }),
        { description: "It will appear as its own line on the invoice." },
      );
      setPicked(""); setManualPrice(""); setQuantity("1");
      refresh();
    }
    for (const { r, dog } of failed) {
      toast.error(`${dog}: ${(r as PromiseRejectedResult).reason?.message ?? "could not add that extra"}`);
    }
  };

  const chosen = catalogue?.find(c => String(c.id) === picked);
  const needsPrice = chosen ? addOnRequiresManualPrice(chosen.priceMode) : false;
  const canAdd = Boolean(chosen) && (!needsPrice || parseFloat(manualPrice) >= 0);

  const addOns = data?.addOns ?? [];
  const total = addOnsTotal(addOns);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Add-ons
          {petName && <span className="font-normal text-muted-foreground">· {petName}</span>}
        </Label>
        {addOns.length > 0 && (
          <span className="text-xs font-medium">Extras: ${total}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : addOns.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing added yet. Anything added here becomes its own line on the invoice.
        </p>
      ) : (
        <div className="space-y-1">
          {addOns.map(a => {
            const gross = Number(a.unitPrice) * a.quantity;
            const discount = discountFromColumns((a as any).discountPercent, (a as any).discountAmount);
            const broken = applyLineDiscount(gross.toFixed(2), discount);
            const doneBy = staffList?.find(st => st.id === (a as any).staffId);
            return (
            <div key={a.id} className="rounded bg-muted/50 px-2 py-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.quantity > 1 && <span className="shrink-0 text-muted-foreground">× {a.quantity}</span>}
                <span className="shrink-0 font-medium tabular-nums">
                  {/* The full rate stays visible with the discount struck
                      through it. A quietly reduced number reads as though
                      the salon's prices changed. */}
                  {broken.discountCents > 0 && (
                    <span className="mr-1 font-normal text-muted-foreground line-through">
                      ${gross.toFixed(2)}
                    </span>
                  )}
                  ${(broken.netCents / 100).toFixed(2)}
                </span>
                <button
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title={`Edit ${a.name}`}
                  onClick={() => setEditing(editing === a.id ? null : a.id)}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title={`Remove ${a.name}`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate({ id: a.id })}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {/* What is set, when the editor is closed. */}
              {editing !== a.id && (doneBy || broken.discountCents > 0) && (
                <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {doneBy && <span>done by {doneBy.name.split(" ")[0]}</span>}
                  {broken.discountCents > 0 && (
                    <span>{describeLineDiscount(discount, broken.discountCents)}
                      {(a as any).discountReason ? ` — ${(a as any).discountReason}` : ""}</span>
                  )}
                </div>
              )}
              {editing === a.id && (
                <AddOnEditor
                  addOn={a as any}
                  gross={gross}
                  staffList={staffList ?? []}
                  onDone={() => setEditing(null)}
                  onSaved={() => { utils.appointmentAddOns.list.invalidate({ appointmentId }); setEditing(null); }}
                />
              )}
            </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Select value={picked} onValueChange={(v) => { setPicked(v); setManualPrice(""); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add an extra…" /></SelectTrigger>
            <SelectContent>
              {(catalogue ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">
                      {addOnRequiresManualPrice(c.priceMode) ? "quote" : `$${c.priceAud ?? "0.00"}`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needsPrice && (
          <Input
            className="h-8 w-20 text-xs" placeholder="$ amount" inputMode="decimal"
            value={manualPrice} onChange={e => setManualPrice(e.target.value)}
          />
        )}

        <Input
          className="h-8 w-14 text-xs" inputMode="numeric" title="How many"
          value={quantity} onChange={e => setQuantity(e.target.value)}
        />

        <Button
          size="sm" variant="outline" className="h-8 shrink-0 gap-1"
          disabled={!canAdd || addMutation.isPending}
          onClick={handleAdd}
        >
          {/* The count is in the label, so what is about to be charged
              is readable before the press rather than after it. */}
          <Plus className="h-3.5 w-3.5" />
          {targets.length > 1 ? `Add to ${targets.length} dogs` : "Add"}
        </Button>
      </div>

      {siblings.length > 0 && (
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 accent-primary"
            checked={applyToAll}
            onChange={e => setApplyToAll(e.target.checked)}
          />
          Add to every dog on this booking
          <span className="truncate">
            ({[petName ?? "this dog", ...siblings.map(s => s.petName)].join(", ")})
          </span>
        </label>
      )}

      {needsPrice && (
        <p className="text-xs text-muted-foreground">
          {chosen?.name} is quoted per dog, so there is no list price to copy — enter what was agreed.
        </p>
      )}
    </div>
  );
}

export default AppointmentAddOns;

/**
 * Editing one add-on: who did it, and a discount on the line.
 *
 * Andy, 27/10/2026. Two separate things, deliberately in one panel
 * because they are both "this line is not quite the default" and the row
 * has no room for either on its own.
 *
 * The groomer is NOT the dog's groomer by default — it is blank, meaning
 * "whoever has the dog". A teeth clean on a two-dog booking is often
 * done by the other one, which is the case that prompted this.
 */
function AddOnEditor({
  addOn, gross, staffList, onDone, onSaved,
}: {
  addOn: { id: number; name: string; staffId?: number | null; discountPercent?: string | null; discountAmount?: string | null; discountReason?: string | null };
  gross: number;
  staffList: { id: number; name: string }[];
  onDone: () => void;
  onSaved: () => void;
}) {
  const existing = discountFromColumns(addOn.discountPercent, addOn.discountAmount);
  const [staffId, setStaffId] = useState<string>(addOn.staffId ? String(addOn.staffId) : "none");
  const [kind, setKind] = useState<"percent" | "amount">(existing?.kind ?? "amount");
  const [value, setValue] = useState(existing ? String(existing.value) : "");
  const [reason, setReason] = useState(addOn.discountReason ?? "");

  const update = trpc.appointmentAddOns.update.useMutation({
    onSuccess: () => { toast.success(`${addOn.name} updated`); onSaved(); },
    onError: (error) => toast.error(error.message),
  });

  // Checked as it is typed, so "$50 off" on a $35 add-on is refused here
  // rather than clamped silently when the invoice is built.
  const clearing = value.trim() === "";
  const check = clearing
    ? null
    : validateLineDiscount({ kind, value, reason, gross: gross.toFixed(2) });
  const preview = check?.ok
    ? applyLineDiscount(gross.toFixed(2), check.discount)
    : null;

  const save = () => {
    if (check && !check.ok) return;
    update.mutate({
      id: addOn.id,
      staffId: staffId === "none" ? null : Number(staffId),
      discountKind: clearing ? null : kind,
      discountValue: clearing ? null : value,
      discountReason: clearing ? null : reason.trim(),
    });
  };

  return (
    <div className="mt-1.5 space-y-2 rounded border bg-background p-2">
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Done by</Label>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {/* Blank is the default and the common case. */}
            <SelectItem value="none" className="text-xs">Whoever has the dog</SelectItem>
            {staffList.map(st => (
              <SelectItem key={st.id} value={String(st.id)} className="text-xs">{st.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Discount</Label>
        <div className="mt-0.5 flex gap-1">
          {/* Percent or dollars — never both on one line, so this is a
              toggle rather than two inputs. */}
          <div className="flex overflow-hidden rounded border">
            {(["amount", "percent"] as const).map(k => (
              <button
                key={k} type="button"
                className={`px-2 py-1 text-xs ${kind === k ? "bg-violet-600 text-white" : "hover:bg-accent"}`}
                onClick={() => setKind(k)}
              >{k === "amount" ? "$" : "%"}</button>
            ))}
          </div>
          <Input
            className="h-7 flex-1 text-xs"
            placeholder={kind === "amount" ? "0.00" : "0"}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        {!clearing && (
          <Input
            className="mt-1 h-7 text-xs"
            placeholder="Why? (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {check && !check.ok && (
          <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{check.error}</p>
        )}
        {preview && preview.discountCents > 0 && (
          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
            ${(preview.discountCents / 100).toFixed(2)} off — line becomes ${(preview.netCents / 100).toFixed(2)}
          </p>
        )}
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 flex-1 text-xs" disabled={update.isPending || Boolean(check && !check.ok)} onClick={save}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

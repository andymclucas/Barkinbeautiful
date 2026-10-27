import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { addOnRequiresManualPrice, addOnsTotal } from "@shared/appointmentAddOns";
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
export function AppointmentAddOns({ appointmentId }: { appointmentId: number }) {
  const utils = trpc.useUtils();
  const { data: catalogue } = trpc.appointmentAddOns.catalogue.useQuery({});
  const { data, isLoading } = trpc.appointmentAddOns.list.useQuery({ appointmentId });

  const { data: staffList } = trpc.staff.listOperational.useQuery({});
  const [editing, setEditing] = useState<number | null>(null);
  const [picked, setPicked] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  const refresh = () => {
    void utils.appointmentAddOns.list.invalidate({ appointmentId });
    void utils.calendar.invalidate();
  };

  const addMutation = trpc.appointmentAddOns.add.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.name} added`, { description: `$${r.unitPrice} — it will appear as its own line on the invoice.` });
      setPicked(""); setManualPrice(""); setQuantity("1");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.appointmentAddOns.remove.useMutation({
    onSuccess: () => { toast.success("Add-on removed"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

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
          onClick={() => addMutation.mutate({
            appointmentId,
            pricingServiceId: Number(picked),
            quantity: Math.max(1, Math.min(20, parseInt(quantity) || 1)),
            ...(needsPrice ? { unitPrice: parseFloat(manualPrice) } : {}),
          })}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

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

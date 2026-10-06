import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { addOnRequiresManualPrice, addOnsTotal } from "@shared/appointmentAddOns";

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
  const { data: catalogue } = trpc.appointmentAddOns.catalogue.useQuery({ tenantId: 1 });
  const { data, isLoading } = trpc.appointmentAddOns.list.useQuery({ tenantId: 1, appointmentId });

  const [picked, setPicked] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  const refresh = () => {
    void utils.appointmentAddOns.list.invalidate({ tenantId: 1, appointmentId });
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
          {addOns.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {a.quantity > 1 && <span className="shrink-0 text-muted-foreground">× {a.quantity}</span>}
              <span className="shrink-0 font-medium tabular-nums">
                ${(Number(a.unitPrice) * a.quantity).toFixed(2)}
              </span>
              <button
                className="shrink-0 text-muted-foreground hover:text-destructive"
                title={`Remove ${a.name}`}
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate({ tenantId: 1, id: a.id })}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
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
            tenantId: 1, appointmentId,
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

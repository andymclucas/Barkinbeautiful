import { useState } from "react";
import { Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

/**
 * Selling a product at the counter, onto this booking's cart.
 *
 * Andy, 09/11/2026: "Add retail items into the appointment card so
 * these can be added to the cart for checkout."
 *
 * ## Once per booking, not once per dog
 *
 * Add-ons are per dog — a teeth clean belongs to the animal that had
 * it. A bag of treats belongs to the PERSON, and splitting it across
 * two dogs would make a family's bill read as two half-purchases. So
 * this sits beside the add-on blocks rather than inside each one, and
 * the line goes on the appointment the panel was opened from. The
 * booking total sums every dog, so it lands in the same place either
 * way.
 *
 * ## It shows stock, and sells anyway
 *
 * The count is what somebody last typed into the Retail page, not what
 * is on the shelf. Refusing a sale because it says zero would stop a
 * real sale over a stale figure with the client standing there, so the
 * number is shown as information and the sale goes through — the
 * server answers with a recount prompt when it goes negative.
 */
export function AppointmentRetail({ appointmentId, onChanged }: {
  appointmentId: number;
  /** So the panel's totals and the payment box refresh with the sale. */
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [picked, setPicked] = useState("");
  const [quantity, setQuantity] = useState("1");

  const { data: products } = trpc.retail.list.useQuery({ includeArchived: false });

  const sell = trpc.appointmentAddOns.addRetail.useMutation({
    onSuccess: (r) => {
      /* The warning is the point of the response. A sale that took the
         shelf to zero or below is something the counter should hear
         about now, not at the next stocktake. */
      toast.success(`${r.name} added — $${r.unitPrice}`, {
        description: r.warning ?? undefined,
        duration: r.warning ? 8000 : 4000,
      });
      setPicked("");
      setQuantity("1");
      void utils.appointmentAddOns.list.invalidate({ appointmentId });
      void utils.retail.list.invalidate();
      onChanged?.();
    },
    onError: (e) => toast.error(e.message, { duration: 8000 }),
  });

  const chosen = (products ?? []).find((p: any) => String(p.id) === picked);
  const qty = Number(quantity);
  const canSell = !!chosen && Number.isInteger(qty) && qty >= 1 && qty <= 20;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <Label className="flex items-center gap-1.5 text-base font-semibold">
        <ShoppingBag className="h-4 w-4 text-primary" /> Shop
      </Label>
      <p className="text-sm text-muted-foreground">
        Anything sold at the counter goes on this booking's bill.
      </p>

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Add a product…" />
            </SelectTrigger>
            <SelectContent>
              {(products ?? []).length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  Nothing in the Retail catalogue yet.
                </div>
              )}
              {(products ?? []).map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">
                      ${p.priceAud ?? "0.00"}
                      {/* Shown, never enforced — see the note above. */}
                      {Number(p.stockQty) <= 0
                        ? " · none left"
                        : Number(p.stockQty) <= 3 ? ` · ${p.stockQty} left` : ""}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Input
          className="h-10 w-16 text-sm" inputMode="numeric" title="How many"
          value={quantity} onChange={(e) => setQuantity(e.target.value)}
        />

        <Button
          size="sm" variant="outline" className="h-10 shrink-0 gap-1 px-4 text-sm font-semibold"
          disabled={!canSell || sell.isPending}
          onClick={() => sell.mutate({ appointmentId, retailProductId: Number(picked), quantity: qty })}
        >
          <Plus className="h-4 w-4" />
          {chosen && qty > 1
            ? `Add ${qty} · $${(Number(chosen.priceAud ?? 0) * qty).toFixed(2)}`
            : "Add"}
        </Button>
      </div>
    </div>
  );
}

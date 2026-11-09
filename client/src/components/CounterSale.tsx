import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  counterSaleLineTotal,
  counterSaleRefusal,
  counterSaleTotals,
  MAX_LINE_QUANTITY,
  type CounterSaleLine,
} from "@shared/counterSale";

/**
 * The counter till.
 *
 * Lauren Romari, 10/11/2026: "what happens if someone walks in just
 * wanting to buy retail?" Nothing did — every way to put a product on a
 * bill went through a booking, so a walk-in had to be given a fake
 * appointment on the diary.
 *
 * The totals and the refusals come from `shared/counterSale.ts`, the
 * same functions the server bills from, so the figure on the button is
 * the figure that is charged and the reason the button is disabled is
 * the sentence the server would refuse with.
 */

type PaymentMethod = "cash" | "eftpos" | "stripe" | "bank_transfer";

const PAYMENT_METHODS: Array<{ key: PaymentMethod; label: string }> = [
  { key: "cash", label: "Cash" },
  { key: "eftpos", label: "EFTPOS" },
  { key: "stripe", label: "Card / link" },
  { key: "bank_transfer", label: "Bank transfer" },
];

function money(value: string | number): string {
  return `$${Number(value).toFixed(2)}`;
}

export function CounterSale({ onSold }: { onSold?: () => void }) {
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientLabel, setClientLabel] = useState("");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [lines, setLines] = useState<CounterSaleLine[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  /* A LIKE search across ten thousand clients on every keystroke is a
     query per letter. Quarter of a second of stillness is below what a
     person notices and well above a typing gap. */
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  const { data: matches, isFetching: searching } = trpc.clients.list.useQuery(
    { search: debounced, pageSize: 6, page: 1 },
    { enabled: debounced.length >= 2 && clientId === null }
  );
  // retail.sellable, not retail.list: the list is protectedProcedure and
  // rejects the restricted staff accounts most likely to be on the desk.
  const { data: products } = trpc.retail.sellable.useQuery({});
  const today = trpc.counterSale.forDay.useQuery({});

  const createClient = trpc.clients.create.useMutation({
    onSuccess: (created: any) => {
      const id = Number(created?.id ?? created?.insertId ?? 0);
      if (!id) {
        toast.error(
          "Client added, but could not be selected — search for them."
        );
        setAdding(false);
        return;
      }
      setClientId(id);
      setClientLabel(`${newClient.firstName} ${newClient.lastName}`.trim());
      setAdding(false);
      setNewClient({ firstName: "", lastName: "", phone: "" });
    },
    onError: e => toast.error(e.message),
  });

  const sell = trpc.counterSale.sell.useMutation({
    onSuccess: result => {
      toast.success(
        `${result.invoiceNumber} · ${money(result.total)}${result.paid ? " taken" : " billed"}`,
        { description: result.description }
      );
      // Said separately, because a low shelf is a different thing from a
      // completed sale and gets lost as a subtitle under it.
      for (const warning of result.warnings) toast.warning(warning);
      setLines([]);
      today.refetch();
      onSold?.();
    },
    onError: e => toast.error(e.message),
  });

  const voidSale = trpc.counterSale.voidSale.useMutation({
    onSuccess: result => {
      toast.success(`${result.invoiceNumber} voided`, {
        description:
          result.restored > 0 ? "Stock put back on the shelf." : undefined,
      });
      today.refetch();
      onSold?.();
    },
    onError: e => toast.error(e.message),
  });

  const sellable = useMemo(
    () => (products ?? []).filter((p: any) => p.isActive !== false),
    [products]
  );
  const totals = useMemo(() => counterSaleTotals(lines), [lines]);
  const refusal = useMemo(() => counterSaleRefusal(lines), [lines]);
  const busy = sell.isPending;

  const addLine = () => {
    const product = sellable.find((p: any) => String(p.id) === productId);
    if (!product) {
      toast.error("Pick a product first");
      return;
    }
    setLines(current => {
      // Ringing the same thing up twice is one line with a bigger number
      // on it, the way a receipt reads.
      const at = current.findIndex(l => l.retailProductId === product.id);
      if (at >= 0) {
        const merged = [...current];
        merged[at] = {
          ...merged[at],
          quantity: Math.min(MAX_LINE_QUANTITY, merged[at].quantity + quantity),
        };
        return merged;
      }
      return [
        ...current,
        {
          retailProductId: product.id,
          name: product.name,
          unitPrice: product.priceAud ?? "0.00",
          quantity,
        },
      ];
    });
    setQuantity(1);
  };

  const setLineQuantity = (id: number, next: number) => {
    setLines(current =>
      current.flatMap(line =>
        line.retailProductId !== id
          ? [line]
          : next < 1
            ? []
            : [{ ...line, quantity: Math.min(MAX_LINE_QUANTITY, next) }]
      )
    );
  };

  const complete = (paymentMethod: PaymentMethod | null) => {
    if (!clientId || refusal) return;
    sell.mutate({
      clientId,
      lines: lines.map(l => ({
        retailProductId: l.retailProductId,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
      })),
      paymentMethod,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 text-primary" /> Counter sale
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          For somebody buying retail without a booking. It becomes a bill on
          their record, and the stock comes off the shelf.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Who ── */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Who is buying</Label>
          {clientId !== null ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 py-1 text-sm">
                {clientLabel || `Client #${clientId}`}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setClientId(null);
                  setClientLabel("");
                  setTerm("");
                }}
              >
                <X className="h-3.5 w-3.5" /> Change
              </Button>
            </div>
          ) : adding ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  placeholder="First name"
                  value={newClient.firstName}
                  onChange={e =>
                    setNewClient({ ...newClient, firstName: e.target.value })
                  }
                />
                <Input
                  placeholder="Last name"
                  value={newClient.lastName}
                  onChange={e =>
                    setNewClient({ ...newClient, lastName: e.target.value })
                  }
                />
                <Input
                  placeholder="Phone (optional)"
                  value={newClient.phone}
                  onChange={e =>
                    setNewClient({ ...newClient, phone: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={
                    !newClient.firstName.trim() ||
                    !newClient.lastName.trim() ||
                    createClient.isPending
                  }
                  onClick={() =>
                    createClient.mutate({
                      firstName: newClient.firstName.trim(),
                      lastName: newClient.lastName.trim(),
                      phone: newClient.phone.trim() || undefined,
                    })
                  }
                >
                  {createClient.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Add and use
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search name, phone or email…"
                  value={term}
                  onChange={e => setTerm(e.target.value)}
                />
              </div>
              {debounced.length >= 2 && (
                <div className="rounded-lg border">
                  {searching && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Searching…
                    </p>
                  )}
                  {!searching && (matches?.clients.length ?? 0) === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Nobody matches “{debounced}”.
                    </p>
                  )}
                  {matches?.clients.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/40"
                      onClick={() => {
                        setClientId(c.id);
                        setClientLabel(
                          `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()
                        );
                      }}
                    >
                      <span className="truncate">
                        {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.phone}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAdding(true)}
              >
                <UserPlus className="h-3.5 w-3.5" /> New client
              </Button>
            </div>
          )}
        </div>

        {/* ── What ── */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            What they are buying
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={productId} onValueChange={setProductId}>
              {/* Its own row on a phone. Sharing one with the quantity and
                    Add left the trigger 116px wide at 375px, which is not
                    enough to read a product name and its price. */}
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[12rem] sm:flex-1">
                <SelectValue placeholder="Add a product…" />
              </SelectTrigger>
              <SelectContent>
                {sellable.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} · {money(p.priceAud ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              max={MAX_LINE_QUANTITY}
              className="w-20"
              value={quantity}
              onChange={e =>
                setQuantity(
                  Math.max(
                    1,
                    Math.min(MAX_LINE_QUANTITY, Number(e.target.value) || 1)
                  )
                )
              }
            />
            <Button variant="outline" className="gap-1.5" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {lines.length > 0 && (
          <div className="rounded-lg border">
            {lines.map(line => (
              <div
                key={line.retailProductId}
                className="flex flex-wrap items-center gap-2 border-b px-3 py-2 last:border-0"
              >
                {/* Its own row on a phone. Sharing one with the stepper,
                    the price and the bin left 51px for the name —
                    measured at 375px — so every product read "Oatm…". */}
                <span className="w-full min-w-0 truncate text-sm sm:w-auto sm:flex-1">
                  {line.name}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`One fewer ${line.name}`}
                    onClick={() =>
                      setLineQuantity(line.retailProductId, line.quantity - 1)
                    }
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">
                    {line.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`One more ${line.name}`}
                    onClick={() =>
                      setLineQuantity(line.retailProductId, line.quantity + 1)
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="w-16 text-right text-sm tabular-nums">
                  {money(counterSaleLineTotal(line))}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Take ${line.name} off the sale`}
                  onClick={() => setLineQuantity(line.retailProductId, 0)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(totals.total)}</span>
            </div>
          </div>
        )}

        {/* ── Money ── */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {clientId === null
              ? "Pick who is buying first"
              : /* The amount is here rather than on every button: five
                   buttons each saying "$61.85" put them on four rows at
                   375px, and the figure is the same figure five times. */
                (refusal ??
                `Taking ${money(totals.total)} — how are they paying?`)}
          </Label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map(method => (
              <Button
                key={method.key}
                size="sm"
                disabled={busy || clientId === null || refusal !== null}
                onClick={() => complete(method.key)}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {method.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || clientId === null || refusal !== null}
              onClick={() => complete(null)}
            >
              Bill them later
            </Button>
          </div>
        </div>

        {/* ── Today ── */}
        {(today.data?.sales.length ?? 0) > 0 && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Counter sales today
              </Label>
              <span className="text-xs font-semibold tabular-nums">
                {money(today.data?.takings ?? 0)} taken
              </span>
            </div>
            <div className="rounded-lg border">
              {today.data?.sales.map((sale: any) => (
                <div
                  key={sale.id}
                  className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {`${sale.firstName ?? ""} ${sale.lastName ?? ""}`.trim()}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {sale.invoiceNumber}
                    </span>
                  </span>
                  <span
                    className={`tabular-nums ${sale.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}
                  >
                    {money(sale.total)}
                  </span>
                  {sale.status === "cancelled" ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Voided
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={voidSale.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Void ${sale.invoiceNumber}? The stock goes back on the shelf.`
                          )
                        ) {
                          voidSale.mutate({ invoiceId: sale.id });
                        }
                      }}
                    >
                      Void
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

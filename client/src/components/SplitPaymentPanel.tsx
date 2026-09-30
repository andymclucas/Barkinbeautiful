import { useMemo, useState } from "react";
import { Banknote, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, splitEvenly, validatePaymentAmount,
  type PaymentMethod,
} from "@shared/splitPayments";

/**
 * Taking the money for a booking, in as many transactions as it takes.
 *
 * The three things the counter actually does - part cash part card, one dog
 * each, deposit then balance - are all the same operation here: add a row
 * against one dog. A multi-dog booking already has a row per dog with its
 * own price, so "Alfie's owner pays for Alfie" needs no special case.
 *
 * The amount is validated here for a fast answer and again on the server,
 * which is the one that counts: two staff on two iPads can be on the same
 * booking, and the second must not be able to overpay it.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  unpaid: "bg-muted text-muted-foreground",
};

export function SplitPaymentPanel({ appointmentId }: { appointmentId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.payments.forBooking.useQuery({ appointmentId });

  const [target, setTarget] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("eftpos");
  const [note, setNote] = useState("");

  const selectedId = target ?? data?.appointments[0]?.appointmentId ?? appointmentId;
  const selected = useMemo(
    () => data?.appointments.find((a) => a.appointmentId === selectedId),
    [data, selectedId],
  );

  const record = trpc.payments.record.useMutation({
    onSuccess: () => {
      setAmount("");
      setNote("");
      toast.success("Payment recorded");
      utils.payments.forBooking.invalidate({ appointmentId });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = trpc.payments.remove.useMutation({
    onSuccess: () => {
      toast.success("Payment removed");
      utils.payments.forBooking.invalidate({ appointmentId });
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !data) {
    return <p className="py-3 text-xs text-muted-foreground">Loading payments…</p>;
  }

  const multiDog = data.appointments.length > 1;
  const check = amount.trim()
    ? validatePaymentAmount(amount, { outstanding: selected?.outstanding ?? null, paid: selected?.paid ?? 0 })
    : null;

  const submit = () => {
    if (!check?.ok) return;
    record.mutate({ appointmentId: selectedId, amount, method, note: note.trim() || undefined });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Banknote className="h-4 w-4 text-muted-foreground" /> Payments
        </p>
        <p className="text-xs text-muted-foreground">
          {data.anyUnpriced
            ? "Some dogs have no price yet"
            : <>Booking {money(data.bookingTotal)} · paid {money(data.bookingPaid)} · owing <strong className="text-foreground">{money(data.bookingOutstanding)}</strong></>}
        </p>
      </div>

      {/* Per dog: what it costs, what has been taken, what is left. */}
      <div className="space-y-1.5">
        {data.appointments.map((entry) => (
          <div key={entry.appointmentId} className="rounded-lg border bg-background px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{entry.petName}</span>
                {entry.status && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[entry.status] ?? ""}`}>
                    {entry.status}
                  </span>
                )}
                {entry.overpaid && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    overpaid
                  </span>
                )}
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {entry.total === null ? "no price" : `${money(entry.total)} · paid ${money(entry.paid)}`}
                {entry.outstanding !== null && entry.outstanding > 0 && (
                  <strong className="ml-1 text-foreground">owing {money(entry.outstanding)}</strong>
                )}
              </span>
            </div>

            {entry.lines.length > 0 && (
              <ul className="mt-1.5 space-y-1 border-t pt-1.5">
                {entry.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[line.method as PaymentMethod] ?? line.method}
                      {line.payerFirstName && <> · {line.payerFirstName} {line.payerLastName}</>}
                      {line.note && <> · {line.note}</>}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={`tabular-nums font-semibold ${Number(line.amount) < 0 ? "text-red-600" : ""}`}>
                        {money(Number(line.amount))}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove this payment"
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate({ paymentId: line.id })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Take a payment */}
      <div className="space-y-2 border-t pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {multiDog && (
            <Select value={String(selectedId)} onValueChange={(v) => setTarget(Number(v))}>
              <SelectTrigger className="h-8 w-[7.5rem] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {data.appointments.map((entry) => (
                  <SelectItem key={entry.appointmentId} value={String(entry.appointmentId)} className="text-xs">
                    {entry.petName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            className="h-8 w-[6.5rem] text-xs"
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger className="h-8 w-[8.5rem] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">{PAYMENT_METHOD_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-8 min-w-[6rem] flex-1 text-xs"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={!check?.ok || record.isPending}
            onClick={submit}
          >
            {record.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Take payment
          </Button>
        </div>

        {/* One tap for the two amounts anyone actually types. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {selected?.outstanding != null && selected.outstanding > 0 && (
            <>
              <QuickAmount label={`Balance ${money(selected.outstanding)}`} onClick={() => setAmount(selected.outstanding!.toFixed(2))} />
              <QuickAmount label={`Half ${money(splitEvenly(selected.outstanding, 2)[0])}`} onClick={() => setAmount(splitEvenly(selected.outstanding!, 2)[0].toFixed(2))} />
              <QuickAmount label={`Third ${money(splitEvenly(selected.outstanding, 3)[0])}`} onClick={() => setAmount(splitEvenly(selected.outstanding!, 3)[0].toFixed(2))} />
            </>
          )}
          {check && !check.ok && <span className="text-[11px] text-red-600">{check.error}</span>}
        </div>
      </div>
    </div>
  );
}

function QuickAmount({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {label}
    </button>
  );
}

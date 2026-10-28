import { useMemo, useState } from "react";
import { Banknote, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ApplyDiscountDialog } from "@/components/ApplyDiscountDialog";
import { describeDiscount } from "@shared/appointmentDiscount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, splitEvenly, validatePaymentAmount,
  type PaymentMethod,
} from "@shared/splitPayments";
import { allocateAcrossDogs, describeAllocation, totalOutstanding, prefilledAmount } from "@shared/payAcrossDogs";
import { cashTender, describeChange, acceptsOverTender } from "@shared/cashTendered";

/** Sentinel for the "every dog on this booking" option in the picker. */
const ALL_DOGS = -1;

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
  paid: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300",
  partial: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300",
  unpaid: "bg-muted text-muted-foreground",
};

export function SplitPaymentPanel({ appointmentId }: { appointmentId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.payments.forBooking.useQuery({ appointmentId });

  const [target, setTarget] = useState<number | null>(null);
  /**
   * What the staff member typed, and whether they have typed at all.
   *
   * Andy, 23/10/2026: "don't need to fill in the total - it should auto
   * populate to take the payment." So the box shows the balance until
   * somebody edits it, and shows exactly what they typed afterwards —
   * including an empty box, which must stay empty rather than springing
   * back to the balance while they are mid-edit.
   *
   * Two pieces of state rather than one because "" is a real value a
   * person can choose. A single string cannot tell "untouched" from
   * "deliberately cleared", and conflating them makes the field refill
   * itself under the cursor.
   */
  /**
   * What this client has already paid in, sitting unspent.
   *
   * Lauren, 28/10/2026: Sweety and Benji's dad handed over $800 cash
   * to pre-pay his baths, and holds $840 on the account — "would like
   * to show their store credit count visible in their invoicing area".
   * The balance existed and was only visible on the client record, so
   * the one place it decides whether to ask for money did not show it.
   *
   * Every dog on a booking belongs to the same client, so the first
   * one names the account.
   */
  const clientId = data?.appointments?.[0]?.clientId ?? null;
  const { data: credit } = trpc.storeCredit.getBalance.useQuery(
    { clientId: clientId as number },
    { enabled: clientId != null },
  );
  const creditBalance = Number(credit?.balance ?? 0);

  const [typedAmount, setTypedAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("eftpos");
  const [note, setNote] = useState("");

  /** Typing, or tapping a quick amount, takes the field off the balance. */
  const setAmount = (value: string) => { setAmountEdited(true); setTypedAmount(value); };
  /** Back onto the balance — after a payment lands, or the target changes. */
  const resetAmount = () => { setAmountEdited(false); setTypedAmount(""); };

  /**
   * Nothing chosen yet means nobody has touched the picker, so choose the
   * thing the counter actually does: a household with two dogs pays once,
   * with one card. It used to fall through to the FIRST dog, which is how
   * Lauren got "It says one dogs name that's all" — the control looked
   * like it was for Agnes, and typing the $290 total was rejected against
   * Agnes's $145.
   *
   * A single-dog booking has no "All dogs" option and no picker at all, so
   * it still falls through to that one dog.
   */
  const multiDog = (data?.appointments.length ?? 0) > 1;
  const effectiveTarget = target ?? (multiDog ? ALL_DOGS : null);
  const selectedId = effectiveTarget ?? data?.appointments[0]?.appointmentId ?? appointmentId;
  const selected = useMemo(
    () => data?.appointments.find((a) => a.appointmentId === selectedId),
    [data, selectedId],
  );

  const record = trpc.payments.record.useMutation({
    onSuccess: () => {
      // resetAmount, not setAmount(""): the balance has just changed, so
      // the box should show what is still owed, not sit empty.
      resetAmount();
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

  /**
   * "All dogs" — one tap at the counter for a household paying together.
   *
   * Lauren, 23/10/2026: "If they are paying all together do I just put
   * in the total amount here? It says one dogs name that's all." She
   * could not: the amount was validated against the SELECTED dog, so
   * $290 on a $290 two-dog booking came back "more than the $145.00
   * outstanding".
   *
   * The ledger still gets a row per dog — every report, invoice and
   * membership check reads it that way — but the person entering it
   * types one number.
   */
  const payingAll = selectedId === ALL_DOGS;
  const balances = data.appointments.map((a) => ({
    appointmentId: a.appointmentId,
    petName: a.petName,
    outstanding: a.outstanding,
  }));

  /**
   * What the box shows: the balance owing, until somebody edits it.
   *
   * It follows whatever is selected, so switching from "All dogs" to one
   * dog swaps $290.00 for that dog's $145.00 without anyone retyping.
   * Nothing is prefilled once the balance is settled — an empty box is
   * the honest state when there is nothing left to take.
   */
  const outstandingForTarget = payingAll
    ? totalOutstanding(balances)
    : (selected?.outstanding ?? 0);
  const amount = prefilledAmount({
    edited: amountEdited, typed: typedAmount, outstanding: outstandingForTarget,
  });

  /**
   * Cash can be over-tendered; a card cannot.
   *
   * Lauren, 27/10/2026: a $110 groom paid with $200 cash was refused
   * outright — "That is more than the $110.00 outstanding" — so nothing
   * could be recorded while the client stood there. Handing over more
   * than the bill is simply how cash works.
   *
   * What gets RECORDED is what the salon keeps. $200 in and $90 out is
   * $110 of revenue; recording the $200 would put money the salon does
   * not have into every report.
   */
  const owedHere = payingAll ? totalOutstanding(balances) : (selected?.outstanding ?? null);
  const tender = acceptsOverTender(method) && amount.trim()
    ? cashTender({ tendered: amount, outstanding: owedHere })
    : null;
  const overTendered = Boolean(tender?.ok && tender.change > 0);
  // Once cash covers the bill, the amount APPLIED is what the rest of
  // the panel works from — never the tendered figure.
  const effectiveAmount = tender?.ok && overTendered ? tender.applied.toFixed(2) : amount;

  const spread = payingAll && effectiveAmount.trim() ? allocateAcrossDogs(effectiveAmount, balances) : null;
  const check = !payingAll && effectiveAmount.trim()
    ? validatePaymentAmount(effectiveAmount, { outstanding: selected?.outstanding ?? null, paid: selected?.paid ?? 0 })
    : null;
  const canSubmit = payingAll ? Boolean(spread?.ok) : Boolean(check?.ok);
  const error = tender && !tender.ok
    ? tender.error
    : payingAll ? (spread && !spread.ok ? spread.error : null) : (check && !check.ok ? check.error : null);

  const submit = async () => {
    if (!canSubmit) return;
    if (payingAll && spread?.ok) {
      // Sequential, so a failure part-way leaves the rows that did land
      // rather than a half-applied batch nobody can see.
      try {
        for (const part of spread.allocations) {
          await record.mutateAsync({
            appointmentId: part.appointmentId,
            amount: part.amount.toFixed(2),
            method,
            note: note.trim() || undefined,
          });
        }
        toast.success(`Payment recorded — ${describeAllocation(spread.allocations)}`);
      } catch {
        // record's own onError has already said what went wrong.
      }
      return;
    }
    record.mutate({ appointmentId: selectedId, amount: effectiveAmount, method, note: note.trim() || undefined });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Banknote className="h-4 w-4 text-muted-foreground" /> Payments
        </p>
        <p className="flex flex-wrap items-center justify-end gap-x-2 text-xs text-muted-foreground">
          {creditBalance > 0 && (
            /* Before the totals, because it changes what to ask for. A
               client with credit on the account should not be handing
               over a card. */
            <span
              className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              title="Paid in advance and not yet used. Take it with the Store credit payment method."
            >
              {money(creditBalance)} store credit
            </span>
          )}
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
                  <span className="rounded-full bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
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

            {/* Where the figure comes from. Each dog on a booking carries its
                OWN extras, and the edit dialog shows only the dog being
                edited — so two dogs each with a $65 teeth clean read as one
                $65 and the booking looked overcharged. Spelling it out costs
                a line and removes the doubt. */}
            {entry.total !== null && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {entry.billedTotalOverride !== null ? (
                  <>
                    Price set by hand
                    {entry.billedOverrideReason ? ` — ${entry.billedOverrideReason}` : ""}
                  </>
                ) : entry.addOnsTotal > 0 ? (
                  <>{money(entry.servicePrice ?? 0)} groom + {money(entry.addOnsTotal)} extras</>
                ) : (
                  <>{money(entry.servicePrice ?? 0)} groom</>
                )}
              </p>
            )}

            {/* Each dog's price is changed on its own row.
                It used to sit under the payment picker further down, which
                acts on whichever dog is selected there — so with Louie
                picked there was no way to see that Lollie's price was
                editable at all. Andy, 13/10: "Why isn't Lollie's price able
                to be adjusted?" It was; it just said Louie. */}
            <BilledOverrideRow
              appointmentId={entry.appointmentId}
              petName={entry.petName}
              current={entry.billedTotalOverride}
              currentReason={entry.billedOverrideReason}
              computed={entry.total}
              onSaved={() => utils.payments.forBooking.invalidate()}
            />

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
                      <span className={`tabular-nums font-semibold ${Number(line.amount) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {money(Number(line.amount))}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove this payment"
                        className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
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
            <Select
              value={String(selectedId)}
              onValueChange={(v) => { setTarget(Number(v)); resetAmount(); }}
            >
              <SelectTrigger className="h-8 w-[7.5rem] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* First, because paying for the whole household is the
                    common case at the counter — not the exception. */}
                <SelectItem value={String(ALL_DOGS)} className="text-xs font-semibold">
                  All dogs {money(totalOutstanding(balances))}
                </SelectItem>
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
            disabled={!canSubmit || record.isPending}
            onClick={submit}
          >
            {record.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Take payment
          </Button>
        </div>

        {/* Discounts belong at the counter as much as at booking: the
            reason for one often only emerges while the client is standing
            there. price is already net, so every total above reflects it. */}
        {selected && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {describeDiscount(selected.discountPercent, selected.discountReason)
                ?? `No discount on ${selected.petName}`}
            </span>
            <ApplyDiscountDialog
              appointmentId={selected.appointmentId}
              grossPrice={selected.preDiscountPrice ?? (selected.total != null ? selected.total.toFixed(2) : null)}
              currentPercent={selected.discountPercent}
              currentReason={selected.discountReason}
              sessionHasOtherPets={(data?.appointments.length ?? 0) > 1}
              onApplied={() => utils.payments.forBooking.invalidate()}
            />
          </div>
        )}

        {/* One tap for the two amounts anyone actually types. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!payingAll && selected?.outstanding != null && selected.outstanding > 0 && (
            <>
              <QuickAmount label={`Balance ${money(selected.outstanding)}`} onClick={() => setAmount(selected.outstanding!.toFixed(2))} />
              <QuickAmount label={`Half ${money(splitEvenly(selected.outstanding, 2)[0])}`} onClick={() => setAmount(splitEvenly(selected.outstanding!, 2)[0].toFixed(2))} />
              <QuickAmount label={`Third ${money(splitEvenly(selected.outstanding, 3)[0])}`} onClick={() => setAmount(splitEvenly(selected.outstanding!, 3)[0].toFixed(2))} />
            </>
          )}
          {payingAll && totalOutstanding(balances) > 0 && (
            <QuickAmount
              label={`Whole booking ${money(totalOutstanding(balances))}`}
              onClick={() => setAmount(totalOutstanding(balances).toFixed(2))}
            />
          )}
          {/* Read back which dogs the money lands on, before it does.
              A part payment fills one dog at a time, so "Agnes $145.00
              and Shirley $55.00" is worth seeing rather than assuming. */}
          {spread?.ok && (
            <span className="text-[11px] text-muted-foreground" data-testid="allocation-preview">
              {describeAllocation(spread.allocations)}
            </span>
          )}
          {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
          {/* The number the counter reads out while the drawer is open.
              Green and bold because handing back the wrong change is the
              mistake this is here to prevent. */}
          {!error && overTendered && tender?.ok && (
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {describeChange(tender.change)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                — recording {`$${tender.applied.toFixed(2)}`}
              </span>
            </span>
          )}
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

/**
 * Type in what this dog is actually being charged.
 *
 * Andy, 13/10/2026: "Need to be able to change the payments section if
 * incorrect... manual overide always needed."
 *
 * The worked-out figure is right nearly always, but a price agreed at the
 * counter does not always decompose into a catalogue price and a list of
 * extras. Staff were otherwise left editing the groom price, or deleting an
 * add-on that genuinely happened, until the total came out right — which
 * makes the invoice lie about what was done.
 *
 * A reason is required. This overrides the salon's own price list, so a
 * year later the difference between a deliberate call and a mis-key has to
 * be readable.
 */
function BilledOverrideRow({
  appointmentId, petName, current, currentReason, computed, onSaved,
}: {
  appointmentId: number;
  petName: string;
  current: number | null;
  currentReason: string | null;
  computed: number | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(current !== null ? current.toFixed(2) : "");
  const [reason, setReason] = useState(currentReason ?? "");

  const save = trpc.payments.setBilledOverride.useMutation({
    onSuccess: (result) => {
      toast.success(result.cleared ? `${petName} back to the worked-out price` : `${petName} set to $${Number(amount).toFixed(2)}`);
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  const parsed = Number(amount);
  const canSave = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && reason.trim() !== "";

  // Collapsed: just the action. The line above this already says where
  // the figure came from, and repeating it on every dog of a booking
  // turns a two-dog panel into a wall of text.
  if (!open) {
    return (
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => {
            setAmount(current !== null ? current.toFixed(2) : computed !== null ? computed.toFixed(2) : "");
            setReason(currentReason ?? "");
            setOpen(true);
          }}
        >
          {current !== null ? `Change ${petName}'s price` : `Set ${petName}'s price by hand`}
        </button>
        {current !== null && (
          <button
            type="button"
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            disabled={save.isPending}
            onClick={() => save.mutate({ appointmentId, amount: null })}
          >
            Use worked-out price
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-2 rounded-md bg-muted/50 px-2 py-2">
      <p className="text-[11px] font-medium">What is {petName} actually being charged?</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-24 text-xs tabular-nums" inputMode="decimal" placeholder="0.00"
          value={amount} onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          className="h-8 min-w-0 flex-1 text-xs" placeholder="Why — e.g. quoted before the coat matted"
          value={reason} onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        This replaces the worked-out figure. The extras stay on the invoice as a record of what was done.
      </p>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm" className="h-7 gap-1 text-[11px]"
          disabled={!canSave || save.isPending}
          onClick={() => save.mutate({ appointmentId, amount, reason: reason.trim() })}
        >
          {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Save price
        </Button>
      </div>
    </div>
  );
}

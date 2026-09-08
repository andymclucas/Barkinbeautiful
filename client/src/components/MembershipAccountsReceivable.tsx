import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CircleDollarSign, CreditCard, FileText, Landmark, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function MembershipAccountsReceivable() {
  const utils = trpc.useUtils();
  const { data: accounts, refetch, isLoading } = trpc.memberships.getAccountsReceivable.useQuery({ tenantId: 1 });
  const [valueTarget, setValueTarget] = useState<{ membershipId: number; appointmentId: number; clientName: string; petName: string | null } | null>(null);
  const [groomValue, setGroomValue] = useState("");
  const [paymentTarget, setPaymentTarget] = useState<{ membershipId: number; clientName: string; petName: string | null } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentSource, setPaymentSource] = useState<"manual" | "moego_import" | "stripe" | "cash">("manual");
  const [paymentNote, setPaymentNote] = useState("");
  const recordValue = trpc.memberships.recordCompletedGroomValue.useMutation({
    onSuccess: () => { toast.success("Delivered groom value recorded for reconciliation"); setValueTarget(null); setGroomValue(""); refetch(); },
    onError: error => toast.error(error.message),
  });
  const createInvoice = trpc.memberships.createArrearsInvoice.useMutation({
    onSuccess: result => { toast.success(`Draft invoice ${result.invoiceNumber} created for $${result.total.toFixed(2)}. It has not been sent.`); refetch(); },
    onError: error => toast.error(error.message),
  });
  const recordPayment = trpc.memberships.recordMembershipPayment.useMutation({
    onSuccess: () => { toast.success("Verified membership payment recorded for reconciliation"); setPaymentTarget(null); setPaymentAmount(""); setPaymentNote(""); refetch(); },
    onError: error => toast.error(error.message),
  });
  const setHold = trpc.memberships.setBookingReviewHold.useMutation({
    onSuccess: result => { toast.success(result.hold ? "Booking review hold applied" : "Booking review hold released"); refetch(); utils.memberships.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const createStripeCheckout = trpc.stripeBilling.createInvoiceCheckout.useMutation({
    onSuccess: result => { toast.success("Stripe Checkout opened in a new tab."); window.open(result.checkoutUrl, "_blank", "noopener,noreferrer"); refetch(); },
    onError: error => toast.error(error.message),
  });

  return <div className="space-y-4">
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardContent className="p-4 flex items-start gap-3">
        <CircleDollarSign className="h-5 w-5 text-primary mt-0.5" />
        <div><p className="font-semibold text-sm">Membership payment reconciliation</p><p className="text-xs text-muted-foreground mt-1">Paid-to-date is compared with the confirmed value of completed grooms. A $0 member appointment is treated as unvalued, not free, until staff record its delivered value. Draft invoices are never sent automatically.</p></div>
      </CardContent>
    </Card>
    {isLoading ? <div className="py-10 text-center text-muted-foreground">Reconciling membership accounts…</div> : <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full min-w-[1050px] text-sm">
        <thead className="border-b bg-muted/50"><tr><th className="p-3 text-left font-medium text-muted-foreground">Client / Pet</th><th className="p-3 text-left font-medium text-muted-foreground">Membership</th><th className="p-3 text-right font-medium text-muted-foreground">Paid to date</th><th className="p-3 text-right font-medium text-muted-foreground">Groom value delivered</th><th className="p-3 text-right font-medium text-muted-foreground">Arrears</th><th className="p-3 text-left font-medium text-muted-foreground">Account status</th><th className="p-3 text-left font-medium text-muted-foreground">Actions</th></tr></thead>
        <tbody>
          {(accounts ?? []).length === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No memberships to reconcile.</td></tr>}
          {(accounts ?? []).map(account => {
            const statusClass = account.accountStatus === "declined" || account.accountStatus === "cancelled" ? "bg-red-100 text-red-800" : account.accountStatus === "grace_period" ? "bg-amber-100 text-amber-800" : account.accountStatus === "arrears_review" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800";
            const label = account.accountStatus === "up_to_date" ? "Up to date" : account.accountStatus.replace("_", " ");
            const firstUnvalued = account.unvaluedGrooms[0];
            return <tr key={account.id} className="border-b last:border-0 align-top hover:bg-muted/20">
              <td className="p-3"><p className="font-medium">{account.clientFirstName} {account.clientLastName}</p><p className="text-xs text-muted-foreground">{account.petName}</p></td>
              <td className="p-3"><p>{account.name}</p><p className="text-xs text-muted-foreground">{account.completedGrooms} completed groom{account.completedGrooms !== 1 ? "s" : ""} · {account.paidPaymentRows + account.ledgerPaymentRows} payment record{account.paidPaymentRows + account.ledgerPaymentRows !== 1 ? "s" : ""}</p></td>
              <td className="p-3 text-right font-semibold text-emerald-700">${account.paidToDate.toFixed(2)}</td>
              <td className="p-3 text-right font-semibold">${account.groomValueDelivered.toFixed(2)}{account.unvaluedCompletedGrooms > 0 && <p className="text-[11px] font-normal text-amber-700">+ {account.unvaluedCompletedGrooms} value pending</p>}</td>
              <td className="p-3 text-right font-bold text-red-700">${account.arrearsAmount.toFixed(2)}</td>
              <td className="p-3"><Badge className={`capitalize ${statusClass}`}>{label}</Badge>{account.requiresBookingReview && <p className="mt-1 text-[11px] text-red-700">Booking review required</p>}</td>
              <td className="p-3"><div className="flex flex-wrap gap-1.5">
                {firstUnvalued && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setValueTarget({ membershipId: account.id, appointmentId: firstUnvalued.id, clientName: `${account.clientFirstName} ${account.clientLastName}`, petName: account.petName }); setGroomValue(""); }}>Value groom</Button>}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPaymentTarget({ membershipId: account.id, clientName: `${account.clientFirstName} ${account.clientLastName}`, petName: account.petName }); setPaymentAmount(""); setPaymentNote(""); }}>Record payment</Button>
                {account.invoiceReady && account.arrearsAmount > 0 && !account.openInvoice && <Button size="sm" className="h-7 text-xs" disabled={createInvoice.isPending} onClick={() => createInvoice.mutate({ membershipId: account.id })}><FileText className="mr-1 h-3 w-3" />Draft invoice</Button>}
                {account.openInvoice && <><Badge variant="outline" className="h-7 px-2 text-xs">{account.openInvoice.invoiceNumber} · {account.openInvoice.status}</Badge><Button size="sm" variant="outline" className="h-7 text-xs" disabled={createStripeCheckout.isPending || account.openInvoice.status === "paid"} onClick={() => createStripeCheckout.mutate({ invoiceId: account.openInvoice!.id })}><CreditCard className="mr-1 h-3 w-3" />Stripe checkout</Button></>}
                {account.requiresBookingReview && <Button size="sm" variant="outline" className={`h-7 text-xs ${account.bookingSuspended ? "border-red-300 text-red-700" : ""}`} disabled={setHold.isPending} onClick={() => setHold.mutate({ membershipId: account.id, hold: !account.bookingSuspended })}><LockKeyhole className="mr-1 h-3 w-3" />{account.bookingSuspended ? "Release hold" : "Place hold"}</Button>}
              </div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}
    <Dialog open={!!valueTarget} onOpenChange={open => { if (!open) { setValueTarget(null); setGroomValue(""); } }}>
      <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Record delivered groom value</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><p className="text-muted-foreground">Record the value delivered for <strong className="text-foreground">{valueTarget?.clientName}</strong>{valueTarget?.petName ? ` (${valueTarget.petName})` : ""}. This preserves the $0 member appointment while enabling an accurate arrears calculation.</p><div className="space-y-1"><Label>Delivered groom value ($)</Label><Input autoFocus type="number" min="0.01" step="0.01" value={groomValue} onChange={event => setGroomValue(event.target.value)} placeholder="0.00" /></div></div><DialogFooter><Button variant="outline" onClick={() => setValueTarget(null)}>Cancel</Button><Button disabled={!groomValue || recordValue.isPending} onClick={() => { if (valueTarget) recordValue.mutate({ membershipId: valueTarget.membershipId, appointmentId: valueTarget.appointmentId, amount: Number(groomValue) }); }}>{recordValue.isPending ? "Saving…" : "Record value"}</Button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={!!paymentTarget} onOpenChange={open => { if (!open) { setPaymentTarget(null); setPaymentAmount(""); setPaymentNote(""); } }}>
    <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Record verified membership payment</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><p className="text-muted-foreground">This adds a reconciliation record for <strong className="text-foreground">{paymentTarget?.clientName}</strong>{paymentTarget?.petName ? ` (${paymentTarget.petName})` : ""}. It does not charge the client or send a receipt.</p><div className="space-y-1"><Label>Amount received ($)</Label><Input autoFocus type="number" min="0.01" step="0.01" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} placeholder="0.00" /></div><div className="space-y-1"><Label>Evidence source</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentSource} onChange={event => setPaymentSource(event.target.value as typeof paymentSource)}><option value="manual">Verified manually</option><option value="moego_import">MoeGo record</option><option value="stripe">Stripe record</option><option value="cash">Cash received</option></select></div><div className="space-y-1"><Label>Reference or note</Label><Input value={paymentNote} onChange={event => setPaymentNote(event.target.value)} placeholder="Optional payment reference" /></div></div><DialogFooter><Button variant="outline" onClick={() => setPaymentTarget(null)}>Cancel</Button><Button disabled={!paymentAmount || recordPayment.isPending} onClick={() => { if (paymentTarget) recordPayment.mutate({ membershipId: paymentTarget.membershipId, amount: Number(paymentAmount), source: paymentSource, note: paymentNote || undefined }); }}>{recordPayment.isPending ? "Recording…" : "Record payment"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}

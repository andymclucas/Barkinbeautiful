import { useState } from "react";
import { Mail, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { describeInvoiceEmailPrompt, looksLikeEmail } from "@shared/invoiceEmailPrompt";
import { INVOICE_EMAIL_ENABLED, INVOICE_EMAIL_HELD_MESSAGE } from "@shared/invoiceEmailGate";

/**
 * "Email invoice", with the confirmation box Andy asked for.
 *
 * Andy, 30/10/2026: "if there an email on file bring up a confirmation
 * box to say 'email invoice to client on xxxxx email?' If it doesn't
 * have an email address attached, give an option to add an email
 * address to send to."
 *
 * The wording and the four states live in shared/invoiceEmailPrompt.ts
 * and are unit tested there; this component renders them and nothing
 * more. Which matters, because the no-email branch is the usual one —
 * only 27% of this salon's clients have an address on file — so it had
 * to be a first-class path rather than an error.
 *
 * The target is only fetched once the dialog opens. There is no point
 * running a query per appointment block on a calendar showing thirty
 * dogs for a button almost none of them will press.
 */
export function EmailInvoiceButton({
  appointmentId,
  onSent,
}: {
  appointmentId: number;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [save, setSave] = useState(true);

  const target = trpc.payments.invoiceEmailTarget.useQuery(
    { appointmentId },
    { enabled: open, refetchOnWindowFocus: false },
  );

  const send = trpc.payments.emailInvoice.useMutation({
    onSuccess: (r) => {
      toast.success(
        `${r.paidInFull ? "Receipt" : "Invoice"} ${r.invoiceNumber} emailed to ${r.sentTo}` +
          (r.savedToClient ? " — address saved to their record" : ""),
      );
      setOpen(false);
      setEmail("");
      onSent?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const prompt = target.data
    ? describeInvoiceEmailPrompt(target.data as never)
    : null;

  const typed = email.trim();
  const canSend = INVOICE_EMAIL_ENABLED && (prompt
    ? prompt.needsEmail
      ? looksLikeEmail(typed)
      : prompt.canSend
    : false);

  return (
    <>
      <Button
        variant="outline"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        title={INVOICE_EMAIL_ENABLED
          ? "Email this booking's invoice to the client"
          : INVOICE_EMAIL_HELD_MESSAGE}
      >
        <Mail className="h-4 w-4" />
        Email invoice
        {!INVOICE_EMAIL_ENABLED && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            On hold
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEmail(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{prompt?.title ?? "Email invoice"}</DialogTitle>
            <DialogDescription>
              {target.isLoading ? "Checking this booking…" : prompt?.body ?? ""}
            </DialogDescription>
          </DialogHeader>

          {!INVOICE_EMAIL_ENABLED && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{INVOICE_EMAIL_HELD_MESSAGE}</span>
            </div>
          )}

          {prompt?.warning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{prompt.warning}</span>
            </div>
          )}

          {prompt?.needsEmail && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoice-email">Email address</Label>
                <Input
                  id="invoice-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={save}
                  onCheckedChange={(v) => setSave(v === true)}
                />
                Save this address to the client&rsquo;s record
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!canSend || send.isPending || target.isLoading}
              onClick={() => send.mutate({
                appointmentId,
                ...(prompt?.needsEmail ? { email: typed } : {}),
                saveToClient: prompt?.needsEmail ? save : false,
              })}
            >
              {send.isPending ? "Sending…" : prompt?.confirmLabel ?? "Email invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

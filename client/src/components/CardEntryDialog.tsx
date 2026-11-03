/**
 * Entering a card at the counter, inside Groomigo.
 *
 * Andy, 03/11/2026: "I need to not have a text sent to the client when
 * adding a card - just need to be able to add a card to the clients
 * file securely without authenticating."
 *
 * Nothing is sent, and the client does nothing: staff turn the iPad
 * round, the client types their card, it saves to their file.
 *
 * The fields are Stripe's, not ours. `CardElement` renders inside an
 * iframe served by Stripe, so the number goes from the browser to
 * Stripe and never passes through Groomigo — which is the whole reason
 * this business stays on SAQ A. An ordinary <input> here would put card
 * data in our logs, our error reports and our PCI scope, and would be
 * very hard to undo once staff were used to it.
 *
 * There is no 3DS step on the way in. Saving a card is a SetupIntent,
 * not a payment, and Australian cards are not under PSD2's
 * strong-authentication rules — so the client types the number and
 * that is the end of their involvement. A later off-session charge can
 * still be challenged by the issuer, which is why the charge path
 * reports `authentication_required` in words a receptionist can act on.
 */
import { useEffect, useMemo, useState } from "react";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
/*
 * The /pure entry, NOT "@stripe/stripe-js". The main entry injects
 * js.stripe.com on IMPORT, so simply shipping this component put a
 * third-party script on every screen in the salon — the workflow board
 * on the wall included — for a dialog almost nobody opens. /pure waits
 * until loadStripe is actually called.
 */
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * loadStripe once per key, not once per render: it injects a script
 * tag, and calling it on every open would add one each time.
 */
const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key)!;
}

/**
 * Who the card is being saved against.
 *
 * Two ways in, one form. From a booking the appointment names the
 * client, and the procedures are operational because taking payment is
 * a counter job. From the client record there is no appointment, and
 * that page is already admin-only, so the by-client pair sits on
 * stripeCards with the rest of the card surface.
 */
export type CardEntryTarget =
  | { appointmentId: number; clientId?: undefined }
  | { clientId: number; appointmentId?: undefined };

function CardForm({ target, onSaved, onCancel }: {
  target: CardEntryTarget;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const utils = trpc.useUtils();

  const byAppointment = target.appointmentId !== undefined;
  const createViaAppointment = trpc.payments.createCardSetupIntent.useMutation();
  const saveViaAppointment = trpc.payments.saveCardFromSetupIntent.useMutation();
  const createViaClient = trpc.stripeCards.createSetupIntent.useMutation();
  const saveViaClient = trpc.stripeCards.saveSetupIntent.useMutation();

  const submit = async () => {
    if (!stripe || !elements || busy) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setBusy(true);
    try {
      // The intent is created only once the card is actually being
      // submitted. Creating it on open would leave an abandoned
      // SetupIntent at Stripe every time somebody opened the dialog and
      // changed their mind.
      const { clientSecret } = byAppointment
        ? await createViaAppointment.mutateAsync({ appointmentId: target.appointmentId! })
        : await createViaClient.mutateAsync({ clientId: target.clientId! });
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        toast.error(result.error.message ?? "That card could not be saved");
        return;
      }
      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        toast.error("Stripe confirmed the card but returned no reference");
        return;
      }
      const saved = byAppointment
        ? await saveViaAppointment.mutateAsync({ appointmentId: target.appointmentId!, setupIntentId })
        : await saveViaClient.mutateAsync({ clientId: target.clientId!, setupIntentId });
      toast.success(
        saved.last4 ? `Card saved — ${saved.brand ?? "card"} ···· ${saved.last4}` : "Card saved to this client",
      );
      // Both surfaces read the card: the booking panel and the client
      // record. Refresh whichever is open.
      utils.payments.cardOnFile.invalidate();
      utils.stripeCards.cardStatus.invalidate();
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "That card could not be saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-background px-3 py-3">
        <CardElement
          onReady={() => setReady(true)}
          options={{
            hidePostalCode: true,
            /*
             * Link OFF, and this is the whole reason the charge button
             * had never worked.
             *
             * Stripe's card field offers Link autofill to anyone it
             * recognises, and a client who accepts it leaves a LINK
             * payment method on file rather than a card. Link wants the
             * customer present, so the saved method then cannot be
             * charged off-session — which is the entire point of saving
             * it. Both payment methods in this database arrived that
             * way, and the first live charge declined because of it.
             *
             * A card typed here must be a card.
             */
            disableLink: true,
            style: {
              base: {
                fontSize: "16px", // 16px or iOS zooms the whole page on focus
                color: "hsl(var(--foreground))",
                "::placeholder": { color: "hsl(var(--muted-foreground))" },
              },
            },
          }}
        />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Typed straight into Stripe — the number never reaches Groomigo. Saved to this
        client as a card, so it can be charged next time without asking again.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" className="gap-1.5" onClick={submit} disabled={!stripe || !ready || busy}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save card
        </Button>
      </div>
    </div>
  );
}

export function CardEntryDialog({ clientName, open, onOpenChange, onSaved, ...target }: CardEntryTarget & {
  clientName?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { data: config } = trpc.payments.cardEntryConfig.useQuery(undefined, { enabled: open });
  // id for the CardElement's label, so two dialogs cannot collide.
  void target;
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (config?.inPlace && config.publishableKey) setStripePromise(stripeFor(config.publishableKey));
  }, [config?.inPlace, config?.publishableKey]);

  const options = useMemo(() => ({ appearance: { theme: "stripe" as const } }), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a card{clientName ? ` — ${clientName}` : ""}</DialogTitle>
          <DialogDescription>
            Turn the screen round and let the client type it in. Nothing is sent to them.
          </DialogDescription>
        </DialogHeader>
        {stripePromise ? (
          <Elements stripe={stripePromise} options={options}>
            <CardForm
              target={target as CardEntryTarget}
              onSaved={() => { onOpenChange(false); onSaved(); }}
              onCancel={() => onOpenChange(false)}
            />
          </Elements>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
            Loading Stripe…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CardEntryDialog;

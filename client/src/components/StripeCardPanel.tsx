import { useState } from "react";
import { CreditCard, Link2, Loader2, ShieldCheck, TriangleAlert, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The card a client has on file, and how to get one.
 *
 * The salon never types a card number: "Send card link" produces a Stripe
 * hosted page, the client enters the card there, and Stripe tells us the
 * payment method through the webhook. Nothing on this panel can see or set
 * card details, which is what keeps the business out of PCI scope.
 *
 * The link is shown for the staff member to send by whatever channel suits -
 * rather than texted automatically - because messaging a real client is a
 * deliberate act, not a side effect of opening a page.
 */
export function StripeCardPanel({ clientId }: { clientId: number }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const utils = trpc.useUtils();

  const { data: config } = trpc.stripeCards.configuration.useQuery();
  const { data: card, isLoading } = trpc.stripeCards.cardStatus.useQuery({ clientId });

  const createLink = trpc.stripeCards.createSetupLink.useMutation({
    onSuccess: (result) => {
      setLink(result.url);
      setCopied(false);
      toast.success("Card link ready — send it to the client");
    },
    onError: (error) => toast.error(error.message),
  });

  const removeCard = trpc.stripeCards.removeCard.useMutation({
    onSuccess: () => {
      toast.success("Card removed");
      utils.stripeCards.cardStatus.invalidate({ clientId });
    },
    onError: (error) => toast.error(error.message),
  });

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
  };

  return (
    <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Card on file</p>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Checking…</p>
            ) : card?.description ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {card.chargeable ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                )}
                {card.description}
                {card.expired && <span className="font-semibold text-amber-700 dark:text-amber-300">· expired</span>}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No card saved — memberships cannot be billed automatically
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={createLink.isPending || !config?.configured}
            onClick={() => createLink.mutate({ clientId })}
            title={config?.configured ? undefined : "Stripe is not configured on this deployment"}
          >
            {createLink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {card?.description ? "New card link" : "Send card link"}
          </Button>
          {card?.description && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
              disabled={removeCard.isPending}
              onClick={() => removeCard.mutate({ clientId })}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>

      {config && !config.configured && (
        <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Stripe has no live key on this deployment, so cards cannot be saved or charged yet.
        </p>
      )}
      {config?.configured && config.mode === "test" && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Stripe is in <strong>test</strong> mode — no real money will move.
        </p>
      )}

      {link && (
        <div className="mt-3 rounded-lg border bg-muted/40 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Send this to the client. It opens Stripe's own secure page and expires after use.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
            />
            <Button size="sm" variant="secondary" className="gap-1.5 shrink-0" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

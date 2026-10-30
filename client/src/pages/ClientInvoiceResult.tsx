import { PawPrint, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";

/**
 * Where Stripe Checkout returns a CLIENT after paying an invoice.
 *
 * These two paths are the success_url and cancel_url of the pay link in
 * an invoice email. They have to exist and they have to be public: the
 * staff flow returns to /memberships, and sending a dog owner there
 * would put a login wall in front of somebody who has just paid.
 *
 * Registered BEFORE "/portal/:token", for the same reason
 * ClientPortalCardResult is: otherwise "invoice-paid" is read as an
 * access token, the lookup fails, and the client is shown an error
 * moments after handing over their money.
 *
 * Nothing here reads a query parameter and nothing is looked up by it.
 * The payment is recorded by the checkout.session.completed webhook,
 * not by this page, so there is nothing a stranger could learn by
 * guessing the URL — and nothing to go wrong if the webhook is a few
 * seconds behind the redirect, which it often is.
 */
export default function ClientInvoiceResult({ paid }: { paid: boolean }) {
  // The salon's colours, not Groomigo's — this is their client.
  usePublicBrandTheme();
  // Name from the tenant rather than hardcoded, so the next salon's
  // clients are not thanked by this one.
  const branding = trpc.settings.getPublicBranding.useQuery({});
  const salon = branding.data?.name?.trim() || "your groomer";

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-violet-50 px-4 py-10 dark:from-pink-950/40 dark:to-violet-950/40">
      <section className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div className="space-y-5 rounded-3xl bg-primary p-8 text-primary-foreground shadow-sm">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-card/15">
            <PawPrint className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] opacity-80">{salon}</p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight">
              {paid ? "Thank you — your payment went through." : "Nothing was paid."}
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 opacity-90">
            {paid
              ? "There is nothing else for you to do. A receipt is on its way to the email address this invoice was sent to."
              : "Nothing was charged and nothing was stored. The link in your invoice still works whenever you are ready."}
          </p>
        </div>

        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {paid ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Paid
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-muted-foreground" /> Not paid
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            {paid ? (
              <>
                <p>
                  Your payment may take a moment to show against your account. That is
                  normal and nothing has gone wrong.
                </p>
                <p>
                  If anything looks wrong, reply to the invoice email and {salon} will
                  sort it out.
                </p>
              </>
            ) : (
              <p>
                You can close this page. If the link has stopped working, reply to your
                invoice email and {salon} will send a new one.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

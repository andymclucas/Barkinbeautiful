import { useState, useEffect } from "react";
import { Link } from "wouter";
import { CreditCard, PawPrint, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Where Stripe Checkout returns a client after a card setup link.
 *
 * These two paths are the success_url and cancel_url in createCardSetupLink.
 * Without them "/portal/card-saved" matched the "/portal/:token" route, so the
 * app asked the server for a portal with the token "card-saved", failed, and
 * showed an error — to a client who had just successfully handed over their
 * card details. These routes must stay registered BEFORE "/portal/:token".
 *
 * Nothing here reads the ?client= parameter. The card is attached by the
 * checkout.session.completed webhook, not by this page, so there is nothing
 * to look up and nothing a stranger could learn by guessing the URL.
 */
export default function ClientPortalCardResult({ saved }: { saved: boolean }) {
  // Where the client was before Stripe, if they started from inside the
  // portal. A client on a link has no login, so "Go to client sign in" is a
  // dead end for them; this puts them back where they were. Read once on
  // mount because sessionStorage can throw in a private window.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("portalReturnTo");
      // Only ever a path on this site, never a host somebody could have put there.
      if (stored && stored.startsWith("/portal/") && !stored.startsWith("//")) setReturnTo(stored);
      sessionStorage.removeItem("portalReturnTo");
    } catch { /* storage blocked — the sign-in link below still works */ }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 px-4 py-10">
      <section className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div className="space-y-5 rounded-3xl bg-primary p-8 text-primary-foreground shadow-sm">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-card/15">
            <PawPrint className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] opacity-80">Barkin&rsquo; Beautiful</p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight">
              {saved ? "Thank you — your card is saved." : "No card was saved."}
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 opacity-90">
            {saved
              ? "You don't need to do anything else. We'll use this card for your grooming membership, and we'll always tell you before anything changes."
              : "Nothing was charged and nothing was stored. You can use the same link again whenever you're ready."}
          </p>
        </div>

        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {saved ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> All done
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-muted-foreground" /> Card not saved
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            {saved ? (
              <>
                <p className="flex items-start gap-2">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Your card details are held securely by Stripe, our payment provider. The salon never sees or stores
                    your full card number.
                  </span>
                </p>
                <p>If you have a client portal login, you can sign in to see your upcoming visits.</p>
              </>
            ) : (
              <p>
                If you closed the page by accident, open the link the salon sent you and try again. If the link has
                expired, just ask us for a new one.
              </p>
            )}
            <Button asChild variant={saved ? "default" : "outline"} className="w-full">
              <Link href={returnTo ?? "/portal/login"}>
                {returnTo ? "Back to your portal" : "Go to client sign in"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

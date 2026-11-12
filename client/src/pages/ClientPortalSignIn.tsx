import { useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalSignInLinkForm } from "@/components/PortalSignInLinkForm";
import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";

/**
 * Where a "sign-in link" email lands (Andy, 12/11/2026). Uses the link
 * once, sets the client's session and opens their portal. A used or
 * expired link offers a fresh one on the spot rather than a dead end.
 */
export default function ClientPortalSignIn() {
  usePublicBrandTheme();
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const redeem = trpc.clientPortal.redeemSignInLink.useMutation({
    onSuccess: () => navigate("/portal", { replace: true }),
  });
  // Once only: React's double-invoked effects would otherwise spend the
  // link on the first call and report it as used on the second.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !token) return;
    tried.current = true;
    redeem.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const failed = redeem.isError || !token;
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <ShieldCheck className="mx-auto h-9 w-9 text-primary" />
          <CardTitle>{failed ? "That sign-in link has run out" : "Signing you in…"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {failed ? (
            <>
              <p className="text-sm text-muted-foreground">Each link works once, for 15 minutes. Enter your email for a new one.</p>
              <PortalSignInLinkForm autoFocus buttonLabel="Email me a new link" />
              <Button variant="ghost" className="w-full" onClick={() => navigate("/portal/login")}>Sign in with a password instead</Button>
            </>
          ) : (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

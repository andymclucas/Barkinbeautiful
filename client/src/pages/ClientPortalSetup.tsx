import { FormEvent, useEffect, useState } from "react";
import { PortalSignInLinkForm } from "@/components/PortalSignInLinkForm";
import { useLocation, useParams } from "wouter";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";
import { AgreementGate } from "@/components/portal/AgreementGate";
export default function ClientPortalSetup() {
  // This page is sent to the salon's own clients, so it wears the
  // salon's colours rather than stock Groomigo ones.
  usePublicBrandTheme();
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { data, isLoading, error } = trpc.clientPortal.getSetup.useQuery({ token: token ?? "" }, {
    enabled: Boolean(token),
    // A used or expired link never comes good; three retries with backoff
    // left clients on "Checking your setup link…" for about eight seconds.
    retry: false,
  });
  const completeSetup = trpc.clientPortal.completeSetup.useMutation({ onSuccess: () => navigate("/portal") });
  /*
   * Lauren, 12/11/2026: "Basically everyone we sent out the portal are
   * coming back cause they can't get back into their portal." They open
   * the setup email again, and a setup link only works once. But the
   * phone they set up on is still signed in — the session lasts 30 days —
   * so a used link takes them straight into their portal instead.
   * Asked only once the link has failed: a live reset link must still
   * show the password form, signed in or not.
   */
  const session = trpc.clientPortal.me.useQuery(undefined, { enabled: Boolean(error), retry: false });
  useEffect(() => {
    if (error && session.data) navigate("/portal", { replace: true });
  }, [error, session.data, navigate]);
  /*
   * The service agreement is step one, before the password (Andy,
   * 11/11/2026). Signing does not use the setup link up, so a client who
   * signs and then closes the tab can come back to the same email and
   * finish — they just will not be asked to sign again.
   */
  const [agreementsSigned, setAgreementsSigned] = useState(false);
  const signAgreements = trpc.clientPortal.signAgreementsAtSetup.useMutation({ onSuccess: () => setAgreementsSigned(true) });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) return;
    completeSetup.mutate({ token: token ?? "", password });
  };

  if (isLoading || (error && (session.isLoading || session.data))) return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 p-6"><Card className="w-full max-w-md"><CardContent className="p-6 text-sm text-muted-foreground">Checking your setup link…</CardContent></Card></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 p-6"><Card className="w-full max-w-md text-center"><CardHeader><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><CardTitle>Setup link unavailable</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{error?.message ?? "Please ask the salon for a new client portal setup link."}</p>{/* Andy, 12/11/2026: a client who had already activated came back to this link and could not see how to get in. A used link is gone; her password is not. */}<p className="text-sm font-medium">Already set up? Setup links only work once — enter your email and we&rsquo;ll send you a link to sign in.</p><PortalSignInLinkForm autoFocus /><Button variant="ghost" className="w-full" onClick={() => navigate("/portal/login")}>Sign in with a password instead</Button></CardContent></Card></main>;

  const passwordsMatch = password === confirmPassword;
  const mustSign = (data.pendingAgreements?.length ?? 0) > 0 && !agreementsSigned;

  if (mustSign) {
    return <AgreementGate
      agreements={data.pendingAgreements}
      salonName={data.salon.name}
      firstName={data.client.firstName}
      stepLabel="Step 1 of 2"
      submitting={signAgreements.isPending}
      error={signAgreements.error?.message}
      onSign={(signedName, documentIds) => signAgreements.mutate({ token: token ?? "", signedName, documentIds })}
    />;
  }

  return <main className="min-h-screen bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 px-4 py-10">
    <Card className="mx-auto w-full max-w-lg border-primary/10 shadow-lg">
      <CardHeader>
        {(data.pendingAgreements?.length ?? 0) > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 2 of 2</p>}
        <CardTitle className="text-2xl">Create your client portal password</CardTitle>
        <p className="text-sm text-muted-foreground">Hi {data.client.firstName}, this secure setup link is for {data.salon.name}. It does not create staff or administrator access.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm"><span className="font-medium">Login email:</span> {data.client.email}</div>
          <div className="space-y-2"><Label htmlFor="new-client-password">Password</Label><Input id="new-client-password" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div>
          <div className="space-y-2"><Label htmlFor="confirm-client-password">Confirm password</Label><Input id="confirm-client-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div>
          {!passwordsMatch && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Passwords do not match.</p>}
          {completeSetup.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{completeSetup.error.message}</p>}
          <Button type="submit" className="w-full" disabled={!passwordsMatch || password.length < 8 || completeSetup.isPending}>{completeSetup.isPending ? "Creating account…" : "Create portal account"}</Button>
        </form>
      </CardContent>
    </Card>
  </main>;
}

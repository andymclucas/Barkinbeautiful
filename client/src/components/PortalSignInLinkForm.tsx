import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Email me a sign-in link" — the one way back into the portal that needs
 * nothing remembered (Andy, 12/11/2026). Used on the sign-in page and on
 * every dead end a client can reach: a used setup link, an expired portal
 * link, an expired sign-in link.
 *
 * The server answers the same whatever the address, so the page only ever
 * shows that answer.
 */
export function PortalSignInLinkForm({ autoFocus = false, buttonLabel = "Email me a sign-in link" }: {
  autoFocus?: boolean;
  buttonLabel?: string;
}) {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const send = trpc.clientPortal.requestSignInLink.useMutation();
  /* The code is for a portal saved to an iPhone Home Screen, which keeps
     its own sign-in apart from Safari, where an emailed link opens. */
  const byCode = trpc.clientPortal.redeemSignInCode.useMutation({
    onSuccess: () => navigate("/portal", { replace: true }),
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send.mutate({ email });
  };
  return (
    <form onSubmit={onSubmit} className="space-y-3 text-left">
      <div className="space-y-2">
        <Label htmlFor="signin-link-email">Your email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="signin-link-email" className="pl-9" type="email" autoComplete="email" required
            autoFocus={autoFocus} value={email} onChange={event => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </div>
      {send.data && <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{send.data.message}</p>}
      {send.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{send.error.message}</p>}
      <Button type="submit" className="w-full" disabled={send.isPending || !email} variant={send.data ? "outline" : "default"}>
        {send.isPending ? "Sending…" : send.data ? "Send it again" : buttonLabel}
      </Button>
      {send.data && (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor="signin-code">Or type the 6-digit code from the email</Label>
          <div className="flex gap-2">
            <Input
              id="signin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
              className="text-center text-lg tracking-[0.4em]" placeholder="123456"
              value={code} onChange={event => setCode(event.target.value.replace(/[^0-9 ]/g, ""))}
            />
            <Button type="button" disabled={byCode.isPending || code.replace(/\D/g, "").length !== 6}
              onClick={() => byCode.mutate({ email, code })}>
              {byCode.isPending ? "Checking…" : "Sign in"}
            </Button>
          </div>
          {byCode.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{byCode.error.message}</p>}
        </div>
      )}
    </form>
  );
}

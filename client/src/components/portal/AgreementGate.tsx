import { FormEvent, useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GateAgreement = { id: number; title: string; version: number; body: string };

/**
 * The first page of the client portal until the service agreement is signed.
 *
 * Andy, 11/11/2026: clients "need to sign the agreement as the first page
 * that it shows before they can access their portal". Used twice — on the
 * setup page before the password, and in the portal itself for anybody
 * who already has an account — so it takes plain props and knows nothing
 * about tRPC.
 *
 * Every agreement has its own tick box, and the name is typed, not
 * pre-filled into the signature: a pre-filled signature is somebody else
 * signing for them.
 */
export function AgreementGate({
  agreements,
  salonName,
  firstName,
  stepLabel,
  submitting,
  error,
  onSign,
}: {
  agreements: GateAgreement[];
  salonName: string;
  firstName?: string | null;
  /** "Step 1 of 2" on the setup page. */
  stepLabel?: string;
  submitting: boolean;
  error?: string | null;
  onSign: (signedName: string, documentIds: number[]) => void;
}) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const allTicked = agreements.every((a) => ticked.has(a.id));
  const canSign = allTicked && name.trim().length >= 2 && !submitting;

  const toggle = (id: number, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSign) return;
    onSign(name.trim(), agreements.map((a) => a.id));
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 px-4 py-8 sm:py-10">
      <Card className="mx-auto w-full max-w-2xl border-primary/10 shadow-lg">
        <CardHeader className="space-y-2">
          {stepLabel && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{stepLabel}</p>}
          <CardTitle className="flex items-center gap-2 text-2xl">
            <FileSignature className="h-6 w-6 shrink-0 text-primary" />
            Before we start
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {firstName ? `Hi ${firstName}, please` : "Please"} read and sign {agreements.length === 1 ? "our agreement" : "these agreements"} with {salonName}.
            You only need to do this once.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            {agreements.map((a) => (
              <section key={a.id} className="space-y-3" aria-labelledby={`agreement-${a.id}-title`}>
                <h2 id={`agreement-${a.id}-title`} className="text-base font-semibold">{a.title}</h2>
                <div
                  className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-6"
                  tabIndex={0}
                  data-testid={`agreement-body-${a.id}`}
                >
                  {a.body}
                </div>
                <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={ticked.has(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                    aria-label={`I have read and agree to the ${a.title}`}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                  />
                  <span>I have read and agree to the {a.title}.</span>
                </label>
              </section>
            ))}

            <div className="space-y-2">
              <Label htmlFor="agreement-signed-name">Type your full name to sign</Label>
              <Input
                id="agreement-signed-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={200}
                placeholder="Your full name"
              />
              <p className="text-xs text-muted-foreground">
                Typing your name here is your signature. We record the date and time you signed.
              </p>
            </div>

            {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}

            <Button type="submit" className="w-full" disabled={!canSign}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing…</> : "Agree and continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

import { useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";
import { AgreementGate } from "@/components/portal/AgreementGate";

/**
 * Where a texted {agreement_link} lands: the service agreement, signed on
 * the client's phone, with no account (server/agreementLinkToken.ts).
 *
 * For the clients the emailed portal invitation cannot reach — 238 active
 * unsigned clients on 11/11/2026 had a mobile and no email.
 */
export default function AgreementSign() {
  usePublicBrandTheme();
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const link = trpc.clientPortal.getAgreementLink.useQuery({ token: token ?? "" }, { enabled: Boolean(token), retry: false });
  const sign = trpc.clientPortal.signWithAgreementLink.useMutation({ onSuccess: () => setDone(true) });

  const shell = (title: string, body: string, icon: "ok" | "info") => (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          {icon === "ok"
            ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            : <ShieldCheck className="mx-auto h-9 w-9 text-primary" />}
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{body}</p></CardContent>
      </Card>
    </main>
  );

  if (link.isLoading) {
    return <main className="grid min-h-screen place-items-center p-6"><p className="text-sm text-muted-foreground">Opening your agreement…</p></main>;
  }
  if (link.error || !link.data) {
    return shell("Link unavailable", link.error?.message ?? "Please ask the salon to send you a new link.", "info");
  }
  const salon = link.data.salonName;
  if (done) {
    return shell("Thank you, you're all signed", `${salon} has your signed agreement. You don't need to do anything else.`, "ok");
  }
  if (link.data.pendingAgreements.length === 0) {
    return shell("Already signed", `You've already signed with ${salon}. Nothing more to do — thank you.`, "ok");
  }
  return (
    <AgreementGate
      agreements={link.data.pendingAgreements}
      salonName={salon}
      firstName={link.data.firstName}
      submitting={sign.isPending}
      error={sign.error?.message}
      onSign={(signedName, documentIds) => sign.mutate({ token: token ?? "", signedName, documentIds })}
    />
  );
}

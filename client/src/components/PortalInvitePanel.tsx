import { useState, type ReactNode } from "react";
import { FileSignature, Loader2, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MassTextDialog } from "@/components/MassTextDialog";
import { SUGGESTED_AGREEMENT_TEXT } from "@shared/massTextMerge";

export const PORTAL_INVITE_TYPED_CONFIRM_THRESHOLD = 25;

export type PortalInvitePreview = {
  count: number;
  activeClients: number;
  skipped: { reason: string; label: string; count: number }[];
  sample: string[];
  exampleSubject: string;
  exampleHtml: string;
  enabled: boolean;
};

export type PortalInviteProgress = {
  id: number;
  status: string;
  totalRecipients: number | null;
  sent: number;
  failed: number;
  pending: number;
  running: boolean;
  failures: { clientId: number; email: string; errorMessage: string | null }[];
};

/**
 * The bulk portal invitation, with the service agreement as page one.
 *
 * Plain props, so the confirm-before-sending behaviour can be tested
 * without a server. The container below wires it to tRPC.
 */
export function PortalInvitePanelView({
  preview,
  progress,
  starting,
  resuming,
  onStart,
  onResume,
  textAction,
}: {
  /** The "text the agreement" button; a slot so this view stays server-free. */
  textAction?: ReactNode;
  preview: PortalInvitePreview | undefined;
  progress: PortalInviteProgress | null | undefined;
  starting: boolean;
  resuming: boolean;
  onStart: (confirmedCount: number) => void;
  onResume: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [showEmail, setShowEmail] = useState(false);

  const inFlight = progress?.status === "sending";
  const count = preview?.count ?? 0;
  const needsTyped = count > PORTAL_INVITE_TYPED_CONFIRM_THRESHOLD;
  const confirmed = !needsTyped || typed.trim() === String(count);
  const canSend = Boolean(preview?.enabled) && count > 0 && confirmed && !starting && !inFlight;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-5 w-5 text-primary" />
          Portal invitation with the service agreement
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Emails every active client who isn't on the portal yet a link of their own. Signing the service
          agreement is the first page; then they choose a password. Clients who have already signed go straight to the password.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!preview ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Counting clients…</p>
        ) : (
          <>
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p><span className="text-2xl font-bold" data-testid="invite-count">{count}</span> of {preview.activeClients} active clients would get an email.</p>
              {preview.sample.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Including {preview.sample.join(", ")}{count > preview.sample.length ? "…" : ""}</p>
              )}
              {preview.skipped.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground" aria-label="Not included">
                  {preview.skipped.map((s) => <li key={s.reason}>{s.count} — {s.label}</li>)}
                </ul>
              )}
            </div>

            <div>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setShowEmail((v) => !v)} aria-expanded={showEmail}>
                <Mail className="h-4 w-4" /> {showEmail ? "Hide the email" : "See the email"}
              </Button>
              {showEmail && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Subject: <span className="font-medium text-foreground">{preview.exampleSubject}</span></p>
                  <iframe
                    title="Example invitation email"
                    sandbox=""
                    srcDoc={preview.exampleHtml}
                    className="h-80 w-full rounded-lg border bg-white"
                  />
                </div>
              )}
            </div>

            {!preview.enabled && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Bulk sending is switched off in this environment.
              </p>
            )}

            {!inFlight && preview.enabled && count > 0 && (
              <div className="space-y-3">
                {needsTyped && (
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-invite-confirm">This emails {count} real clients. Type {count} to confirm.</Label>
                    <Input id="portal-invite-confirm" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-[10rem]" />
                  </div>
                )}
                <Button type="button" disabled={!canSend} onClick={() => onStart(count)} className="gap-2">
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send invitations to {count} clients
                </Button>
              </div>
            )}
          </>
        )}

        {/* The text half (Andy, 11/11/2026: "Just create the email and text
            workflow"). Clients with no email cannot get this invitation or
            a portal login, so they are texted a link that opens the
            agreement on its own. Opens the ordinary Mass Text dialog, with
            its own count, typed confirmation and SMS balance check. */}
        <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">Clients with no email</p>
          <p className="text-xs text-muted-foreground">
            They can&rsquo;t get this email or a portal login, so they&rsquo;re texted a link that opens the agreement to sign on their phone.
          </p>
          {textAction}
        </div>

        {progress && (
          <div className="space-y-2 rounded-lg border p-3 text-sm" aria-label="Invitation progress">
            <p className="font-medium">
              {inFlight ? (progress.running ? "Sending…" : "Paused") : "Last send finished"} — {progress.sent} sent, {progress.failed} not sent, {progress.pending} waiting
              {progress.totalRecipients ? ` of ${progress.totalRecipients}` : ""}
            </p>
            {progress.totalRecipients ? (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(((progress.sent + progress.failed) / progress.totalRecipients) * 100)}%` }} />
              </div>
            ) : null}
            {inFlight && !progress.running && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">The server restarted part way through. Resume carries on from where it stopped and never sends anyone a second copy.</p>
                <Button type="button" size="sm" onClick={onResume} disabled={resuming}>Resume sending</Button>
              </div>
            )}
            {progress.failures.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Not sent ({progress.failed})</summary>
                <ul className="mt-1 space-y-0.5">
                  {progress.failures.map((f) => (
                    <li key={`${f.clientId}-${f.email}`}><a className="underline" href={`/clients/${f.clientId}`}>{f.email}</a> — {f.errorMessage ?? "Failed"}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PortalInvitePanel() {
  const utils = trpc.useUtils();
  const preview = trpc.clientPortal.portalInvitePreview.useQuery({});
  const [startedId, setStartedId] = useState<number | null>(null);
  const campaignId = startedId ?? preview.data?.latestCampaignId ?? null;

  const progress = trpc.clientPortal.portalInviteStatus.useQuery(
    { campaignId: campaignId ?? 0 },
    {
      enabled: campaignId !== null,
      refetchInterval: (q) => ((q.state.data as PortalInviteProgress | null | undefined)?.status === "sending" ? 3000 : false),
    },
  );

  const start = trpc.clientPortal.startPortalInvite.useMutation({
    onSuccess: (r) => {
      setStartedId(r.campaignId);
      toast.success(`Sending ${r.queued} invitations`);
      utils.clientPortal.portalInvitePreview.invalidate();
      utils.campaigns.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const resume = trpc.clientPortal.resumePortalInvite.useMutation({
    onSuccess: () => progress.refetch(),
    onError: (e) => toast.error(e.message),
  });

  return (
    <PortalInvitePanelView
      preview={preview.data}
      progress={progress.data as PortalInviteProgress | null | undefined}
      starting={start.isPending}
      resuming={resume.isPending}
      onStart={(confirmedCount) => start.mutate({ confirmedCount })}
      onResume={() => campaignId && resume.mutate({ campaignId })}
      textAction={
        <MassTextDialog
          defaultAudience="agreement_unsigned"
          defaultBody={SUGGESTED_AGREEMENT_TEXT}
          triggerLabel="Text the agreement to clients with no email"
          triggerClassName="gap-1.5"
        />
      }
    />
  );
}

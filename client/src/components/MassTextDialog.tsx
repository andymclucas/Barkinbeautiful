import { useState } from "react";
import { Megaphone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  MASS_TEXT_AUDIENCES, MAX_BODY_LENGTH, needsTypedConfirmation,
  type MassTextAudienceKey,
} from "@shared/massTextRecipients";

const TIERS = ["diamond", "platinum", "gold", "silver", "bronze"] as const;

/**
 * Texting many clients at once.
 *
 * There is no undo on a text and the salon has a finite SMS balance, so
 * the flow is deliberately slow: choose the audience, see exactly how many
 * people and a sample of who, then confirm. Above 25 recipients the sender
 * types the number, because a dialog you can dismiss with one click is not
 * a decision.
 */
export function MassTextDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MassTextAudienceKey>("booked_between");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tier, setTier] = useState<string>("gold");
  const [body, setBody] = useState("");
  const [typed, setTyped] = useState("");
  // Stable for this composition. A retry after a timeout carries the same
  // id, so the server resumes the batch instead of texting everyone again.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const audience =
    kind === "booked_between" ? { kind, from, to }
    : kind === "membership_tier" ? { kind, tier }
    : kind === "hand_picked" ? { kind, clientIds: [] as number[] }
    : { kind: "all_active" as const };

  const preview = trpc.sms.previewMassText.useQuery(
    { tenantId: 1, audience },
    { enabled: open && kind !== "hand_picked" },
  );

  const send = trpc.sms.sendMassText.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.resumed ? "Resumed — s" : "S"}ent ${r.sent} of ${r.attempted}${r.failed ? ` — ${r.failed} failed` : ""}`);
      setOpen(false);
      setBody("");
      setTyped("");
      setRequestId(crypto.randomUUID());
    },
    onError: (error) => toast.error(error.message),
  });

  const count = preview.data?.count ?? 0;
  const previewError = preview.data?.error ?? null;
  const mustType = needsTypedConfirmation(count);
  const typedOk = !mustType || typed.trim() === String(count);
  const canSend = count > 0 && body.trim().length > 0 && body.length <= MAX_BODY_LENGTH && typedOk && !previewError;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Megaphone className="h-3.5 w-3.5" /> Mass text
      </Button>

      <Dialog open={open} onOpenChange={(next) => !send.isPending && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mass text</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Who it goes to</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as MassTextAudienceKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MASS_TEXT_AUDIENCES.map((a) => (
                    <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {kind === "booked_between" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="mt-from">From</Label>
                  <Input id="mt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mt-to">To</Label>
                  <Input id="mt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
            )}

            {kind === "membership_tier" && (
              <div className="grid gap-1.5">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "hand_picked" && (
              <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                Picking clients individually isn&rsquo;t built yet. Use one of the other audiences, or send from
                the client&rsquo;s own conversation.
              </p>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="mt-body">Message</Label>
              <Textarea
                id="mt-body"
                rows={4}
                maxLength={MAX_BODY_LENGTH}
                value={body}
                placeholder="e.g. We've had a burst pipe and are closed today — we'll call to rebook."
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{body.length}/{MAX_BODY_LENGTH} characters</p>
            </div>

            <div className={`rounded-lg border px-3 py-2.5 text-sm ${count > 0 ? "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30" : "bg-muted/40"}`}>
              {previewError ? (
                <p className="text-xs text-muted-foreground">{previewError}</p>
              ) : kind === "hand_picked" ? (
                <p className="text-xs text-muted-foreground">Choose another audience to see a count.</p>
              ) : preview.isFetching ? (
                <p className="text-xs text-muted-foreground">Counting…</p>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    {count} {count === 1 ? "person" : "people"} will be texted
                  </p>
                  {preview.data?.sample?.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      e.g. {preview.data.sample.join(", ")}{count > 5 ? ` and ${count - 5} more` : ""}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    This cannot be undone, and uses {count} of your SMS balance.
                  </p>
                </>
              )}
            </div>

            {mustType && (
              <div className="grid gap-1.5">
                <Label htmlFor="mt-confirm">Type <strong>{count}</strong> to confirm</Label>
                <Input id="mt-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={String(count)} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" disabled={send.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!canSend || send.isPending}
              onClick={() => send.mutate({ tenantId: 1, requestId, audience, body: body.trim(), confirmedCount: count })}
            >
              {send.isPending ? "Sending…" : `Send to ${count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

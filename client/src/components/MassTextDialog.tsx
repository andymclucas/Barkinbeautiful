import { useState, type ReactNode } from "react";
import { Megaphone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateField";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  MASS_TEXT_AUDIENCES, MAX_BODY_LENGTH, needsTypedConfirmation,
  type MassTextAudienceKey,
} from "@shared/massTextRecipients";
import { CARD_LINK_TOKEN, estimatedRenderedLength, usesCardLink } from "@shared/massTextMerge";
import { calculateSmsCost } from "@shared/smsSegments";

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
export function MassTextDialog({
  defaultRange,
  triggerLabel = "Mass text",
  triggerIcon = <Megaphone className="h-3.5 w-3.5" />,
  triggerClassName = "gap-1.5",
}: {
  /*
   * The dates to open on, when something else already knows them.
   *
   * Lauren, 09/11/2026, on the diary for Friday 13 November: "Is there a
   * way to text this days clients to let them know we are closing at
   * 12:30pm early that day... or do I need to do it manually to each
   * one?" She could already — `booked_between` with one day in both
   * boxes — but only from Messages, four steps away from the day she
   * was looking at.
   *
   * Read when the dialog OPENS, not once at mount: the calendar moves
   * under this button all day, and a range captured at mount would text
   * whichever day happened to be on screen when the page loaded.
   */
  defaultRange?: { from: string; to: string };
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MassTextAudienceKey>("booked_between");
  const [from, setFrom] = useState(defaultRange?.from ?? "");
  const [to, setTo] = useState(defaultRange?.to ?? "");
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
    : kind === "members_without_card" ? { kind: "members_without_card" as const }
    : { kind: "all_active" as const };

  const preview = trpc.sms.previewMassText.useQuery(
    { audience },
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
      <Button variant="outline" size="sm" className={triggerClassName} onClick={() => {
        /* The audience is set from whatever the caller is showing RIGHT
           NOW, every time. Nothing else is reset — a half-typed message
           survives closing the dialog by accident, which is worth more
           than a tidy initial state. */
        if (defaultRange) {
          setKind("booked_between");
          setFrom(defaultRange.from);
          setTo(defaultRange.to);
        }
        setOpen(true);
      }}>
        {triggerIcon} {triggerLabel}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="mt-from">From</Label>
                  <DateField id="mt-from" value={from} onChange={next => setFrom(next)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mt-to">To</Label>
                  <DateField id="mt-to" value={to} onChange={next => setTo(next)} />
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

              {/* The card-setup link, 08/11/2026.

                  One button rather than a general merge-field UI: there
                  is exactly one token, and it exists because the MoeGo
                  cutover needs 142 members to put a card on file. Each
                  recipient gets their own Stripe session; the same URL
                  sent to everybody would be one person's. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}${CARD_LINK_TOKEN}`)}
                >
                  Insert card setup link
                </Button>
                {usesCardLink(body) && (
                  <span className="text-xs text-muted-foreground">
                    Each client gets their own link.
                  </span>
                )}
              </div>

              {/* The typed limit is checked against the TEMPLATE, so an
                  11-character token hiding a real link means the message
                  that goes out is longer than the counter above says. */}
              {usesCardLink(body) && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  With the link filled in this sends about{" "}
                  {estimatedRenderedLength(body)} characters per message.
                </p>
              )}

              {/*
                SEGMENTS, which is what Twilio bills. Characters were the
                only figure here, and a character count does not tell
                anybody what a send costs: 160 is one message and 161 is
                two, then every 153 after that.
                Andy, 10/11/2026, asked about a card link: "Would this be
                a single text from Twilio number?" It was four. Nothing on
                this screen would have said so, and the screen is where
                somebody decides to press send to ten thousand people.
              */}
              {body.trim() !== "" && (() => {
                const estimated = estimatedRenderedLength(body);
                /* Padded to the length it will really be, so the cost is
                   worked out on the message that goes out rather than on
                   the template somebody typed. The padding is plain
                   ASCII, which is the encoding a link is anyway. */
                const cost = calculateSmsCost(body + "x".repeat(Math.max(0, estimated - body.length)));
                return (
                  <p className={`text-xs ${cost.segments > 1 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                    {cost.segments} SMS segment{cost.segments === 1 ? "" : "s"} each
                    {count > 0 ? ` · ${(cost.segments * count).toLocaleString()} in total` : ""}
                    {cost.forcedUnicode
                      ? " · an emoji or special character cut the segment size to 67"
                      : ""}
                  </p>
                );
              })()}
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
              onClick={() => send.mutate({ requestId, audience, body: body.trim(), confirmedCount: count })}
            >
              {send.isPending ? "Sending…" : `Send to ${count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

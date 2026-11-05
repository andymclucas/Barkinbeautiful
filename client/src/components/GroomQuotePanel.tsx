import { useState } from "react";
import { Loader2, Plus, Receipt, Send, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  canQuoteInWorkflowState, describeQuoteStatus,
  MAX_QUOTE_DOLLARS, quoteTotal, validateQuoteLines,
} from "@shared/groomQuote";

/**
 * The groomer's end of a mid-groom quote.
 *
 * Lives inside the board's per-dog popup rather than on the row, because
 * the board carries thirty-odd rows at 7am and this is a thing you do to
 * ONE dog, with your hands full, having just found something. The popup is
 * already where somebody goes for that.
 *
 * ## It will not let you start the work before the owner answers
 *
 * The status line says "Waiting on the owner" and stays there. That is the
 * whole product: a groomer who de-matts first and asks afterwards has
 * produced exactly the argument this feature exists to prevent, and the
 * screen should never imply the work is agreed when it is not.
 *
 * ## Record their answer
 *
 * Owners ring back, or get caught at the door. That path is here rather
 * than hidden, because the realistic alternative is a groomer approving
 * their own quote with nobody's agreement behind it. It demands a note
 * saying how the owner was reached, and the record says "staff" rather
 * than pretending the owner tapped the link — a dispute turns on exactly
 * that difference.
 */
export function GroomQuotePanel({
  // Cosmetic: enforceTenant refuses a request naming a salon other than the
  // caller's own, and tenantOf then returns the caller's. The number sent
  // from here is ignored rather than trusted, same as everywhere else on
  // this page.
  tenantId = 1,
  appointmentId,
  petName,
  workflowState,
}: {
  tenantId?: number;
  appointmentId: number;
  petName: string | null | undefined;
  workflowState: string | null | undefined;
}) {
  const utils = trpc.useUtils();
  const quotable = canQuoteInWorkflowState(workflowState);

  /*
   * Polled while anything is waiting on the owner.
   *
   * answerByToken is a publicProcedure, and publicProcedure carries no
   * broadcastChange — so the owner tapping Yes emits nothing and this
   * panel sat on "Waiting on the owner" until somebody closed and
   * reopened the popup. The groomer would stand there with a dog on the
   * table, having been told to wait, with the answer already given.
   *
   * Fifteen seconds, and only while there is an open quote: the window
   * that matters is minutes long, and a board carrying thirty dogs must
   * not poll for all of them for ever.
   */
  const list = trpc.groomQuotes.listForAppointment.useQuery(
    { tenantId, appointmentId },
    {
      refetchInterval: (query) =>
        query.state.data?.quotes.some((q) => q.status === "sent") ? 15_000 : false,
    },
  );
  const refresh = () => utils.groomQuotes.listForAppointment.invalidate({ tenantId, appointmentId });

  const [building, setBuilding] = useState(false);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);
  const [answering, setAnswering] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const raise = trpc.groomQuotes.raise.useMutation({
    onSuccess: () => {
      setBuilding(false);
      setReason("");
      setLines([{ description: "", amount: "" }]);
      refresh();
    },
  });
  const send = trpc.groomQuotes.send.useMutation({ onSuccess: refresh });
  const withdraw = trpc.groomQuotes.withdraw.useMutation({ onSuccess: refresh });
  const record = trpc.groomQuotes.recordAnswer.useMutation({
    onSuccess: () => { setAnswering(null); setNote(""); refresh(); },
  });

  const quotes = list.data?.quotes ?? [];
  /** An invoice already covers this booking, so an approval cannot be undone. */
  const invoiced = Boolean(list.data?.invoiced);
  const draftTotal = quoteTotal(lines.filter((l) => l.description.trim() || l.amount));
  const validation = validateQuoteLines(
    lines.filter((l) => l.description.trim() || l.amount).map((l) => ({
      description: l.description,
      amount: l.amount,
    })),
  );
  const busy = raise.isPending || send.isPending || withdraw.isPending || record.isPending;
  const error = raise.error ?? send.error ?? withdraw.error ?? record.error;

  return (
    <div className="space-y-2" data-testid="popup-quotes">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra work</p>

      {quotes.map((q) => (
        <div key={q.id} className="rounded-lg border bg-muted/40 p-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold tabular-nums">${q.total}</span>
            <span className="text-xs text-muted-foreground">
              {describeQuoteStatus(q.status as any, q.approvalSource as any)}
            </span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {q.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span>{l.description}</span>
                <span className="tabular-nums">${l.amount}</span>
              </li>
            ))}
          </ul>
          {q.approvalNote && (
            <p className="mt-1 text-xs italic text-muted-foreground">{q.approvalNote}</p>
          )}

          {(q.status === "draft" || q.status === "sent") && (
            answering === q.id ? (
              <div className="mt-2 space-y-2">
                {/* Required, and the placeholder says what a useful one looks
                    like. "Staff ticked the box" is worth nothing six weeks
                    later when somebody disputes the charge. */}
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="How did you reach them? e.g. rang Sarah 10:40, she agreed"
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 flex-1" disabled={busy || note.trim().length < 3}
                    onClick={() => record.mutate({ tenantId, quoteId: q.id, decision: "approved", note })}>
                    They said yes
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 flex-1" disabled={busy || note.trim().length < 3}
                    onClick={() => record.mutate({ tenantId, quoteId: q.id, decision: "declined", note })}>
                    They said no
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAnswering(null); setNote(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {q.status === "draft" && (
                  <Button size="sm" className="h-8 flex-1" disabled={busy}
                    onClick={() => send.mutate({ tenantId, quoteId: q.id })}>
                    {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{q.deliveryFailed ? "Try the text again" : "Text the owner"}</span>
                  </Button>
                )}
                {/* Offered on a DRAFT too. The clients who cannot be texted
                    at all — no mobile, or they replied STOP — are exactly
                    the ones Text the owner refuses, and this used to be the
                    only thing the error message told the groomer to do. */}
                <Button size="sm" variant="outline" className="h-8 flex-1" disabled={busy}
                  onClick={() => setAnswering(q.id)}>
                  Record their answer
                </Button>
                <Button size="sm" variant="ghost" className="h-8" disabled={busy}
                  onClick={() => withdraw.mutate({ tenantId, quoteId: q.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          )}

          {q.status === "draft" && q.deliveryFailed && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              The text did not get through, so the owner has not seen this. Check the mobile
              number, or ring them and record what they say.
            </p>
          )}

          {q.status === "approved" && (
            invoiced ? (
              <p className="mt-1.5 text-xs text-muted-foreground">On the bill for this booking.</p>
            ) : (
              /* Undo exists because an approval used to be permanent. An
                 owner mis-tapping Yes, or this being recorded against the
                 wrong dog, could otherwise only be fixed in the database.
                 Refused once an invoice exists — nothing in the app edits
                 an invoice line. */
              <Button size="sm" variant="ghost" className="mt-1.5 h-7 text-xs" disabled={busy}
                onClick={() => withdraw.mutate({ tenantId, quoteId: q.id })}>
                Undo this approval
              </Button>
            )
          )}
        </div>
      ))}

      {!quotable && quotes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {workflowState === "complete"
            ? "This dog has gone home — extra work has to be agreed while they are here."
            : "Check the dog in first."}
        </p>
      )}

      {quotable && !building && (
        <Button size="sm" variant="outline" className="h-8 w-full" onClick={() => setBuilding(true)}>
          <Receipt className="mr-1.5 h-3.5 w-3.5" />
          Quote extra work{petName ? ` for ${petName}` : ""}
        </Button>
      )}

      {building && (
        <div className="space-y-2 rounded-lg border p-2.5">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What did you find? The owner sees this."
            className="h-8 text-xs"
          />
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={line.description}
                onChange={(e) => setLines(lines.map((l, j) => j === i ? { ...l, description: e.target.value } : l))}
                placeholder="De-matting"
                className="h-8 flex-1 text-xs"
              />
              <Input
                value={line.amount}
                onChange={(e) => setLines(lines.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                inputMode="decimal"
                placeholder="40.00"
                className="h-8 w-20 text-xs tabular-nums"
              />
              {lines.length > 1 && (
                <Button size="sm" variant="ghost" className="h-8 px-2"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {lines.length < 10 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setLines([...lines, { description: "", amount: "" }])}>
              <Plus className="mr-1 h-3 w-3" />Another line
            </Button>
          )}

          <div className="flex items-baseline justify-between border-t pt-2 text-sm">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">${draftTotal}</span>
          </div>
          {/* Shown before they can send, not as a failure afterwards. 400
              instead of 40, typed on a phone with a wet dog, is a realistic
              Tuesday and the owner sees that figure first. */}
          {!validation.ok && (
            <p className="text-xs text-amber-700 dark:text-amber-400">{validation.reason}</p>
          )}
          <p className="text-[11px] leading-4 text-muted-foreground">
            Nothing is sent yet. The owner gets a text with this figure and has to say yes before
            it is charged — if they do not answer, nothing is. Limit ${MAX_QUOTE_DOLLARS}.
          </p>

          <div className="flex gap-2">
            <Button size="sm" className="h-8 flex-1" disabled={busy || !validation.ok}
              onClick={() => raise.mutate({
                tenantId,
                appointmentId,
                reason: reason.trim() || undefined,
                lines: lines
                  .filter((l) => l.description.trim() && l.amount)
                  .map((l) => ({ description: l.description.trim(), amount: Number(l.amount) })),
              })}>
              {raise.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save quote
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setBuilding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs">
          {error.message}
        </p>
      )}
    </div>
  );
}

import { useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, Clock3, Loader2, PawPrint, ShieldCheck, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { describeQuoteStatus } from "@shared/groomQuote";

/**
 * Where an owner agrees to extra work, or does not.
 *
 * Opened from a text, on a phone, by someone at work, about a dog that is
 * on the table right now. So: one screen, the figure large, and an answer
 * either way in one tap.
 *
 * ## Declining is as easy as approving, on purpose
 *
 * The temptation with a screen like this is to make "yes" bright and "no"
 * a grey afterthought. That would be a mistake here and an expensive one.
 * An owner who cannot find a comfortable way to say no does not say no —
 * they ring up worried, or they decline the whole groom next time. The
 * salon would rather hear a clean no and carry on with the booked groom,
 * which is exactly what the text under the buttons promises.
 *
 * ## It says what happens if they ignore it
 *
 * Silence is not consent (shared/groomQuote.ts, rule 2). An owner who does
 * nothing is charged nothing, and saying so plainly is what makes that
 * promise worth anything — otherwise the only people who benefit from it
 * are the ones who already trusted the salon.
 */
export default function GroomQuote() {
  const [, params] = useRoute("/quote/:token");
  const token = params?.token ?? "";
  const valid = /^[0-9a-f]{32}$/.test(token);

  const quote = trpc.groomQuotes.getByToken.useQuery({ token }, { enabled: valid, retry: false });
  const [answered, setAnswered] = useState<"approved" | "declined" | null>(null);

  const answer = trpc.groomQuotes.answerByToken.useMutation({
    onSuccess: (result) => { setAnswered(result.status); quote.refetch(); },
  });

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-violet-950 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 text-center shadow-2xl sm:p-8">{children}</div>
    </main>
  );

  if (!valid || quote.error) {
    return shell(
      <>
        <ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
        <h1 className="mt-3 text-lg font-bold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing has been charged. Please call the salon if you need to.
        </p>
      </>,
    );
  }

  if (quote.isLoading || !quote.data) {
    return shell(<p className="py-8 text-sm text-muted-foreground">Loading…</p>);
  }

  const { status, petName, salonName, reason, total, lines, expiresAt } = quote.data;
  const pet = petName || "your dog";

  // Their own answer, just given.
  if (answered) {
    const approved = answered === "approved";
    return shell(
      <>
        <div className={`mx-auto w-fit rounded-2xl p-4 ${approved ? "bg-emerald-400/20" : "bg-slate-400/20"}`}>
          {approved
            ? <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
            : <XCircle className="h-8 w-8 text-slate-600 dark:text-slate-300" />}
        </div>
        <h1 className="mt-4 text-xl font-bold">{approved ? "Thanks — we'll go ahead" : "No problem"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {approved
            ? `${salonName} will do the extra work on ${pet} and it will be added to your bill as $${total}.`
            : `${salonName} will carry on with ${pet}'s booked groom and you won't be charged anything extra.`}
        </p>
      </>,
    );
  }

  // Answered earlier, or timed out, or pulled. One line each, no buttons.
  if (status !== "sent") {
    const expired = status === "expired";
    return shell(
      <>
        <Clock3 className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
        <h1 className="mt-3 text-lg font-bold">
          {expired ? "This request has expired" : describeQuoteStatus(status)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {expired
            ? `Nothing extra has been charged, and ${pet}'s booked groom went ahead as normal. Please call the salon if you'd still like it done.`
            : "Nothing further is needed. Please call the salon if you have a question."}
        </p>
      </>,
    );
  }

  const deadline = expiresAt
    ? new Date(expiresAt).toLocaleTimeString("en-AU", {
        hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane",
      })
    : null;

  return shell(
    <>
      <div className="mx-auto w-fit rounded-2xl bg-violet-100 p-3 dark:bg-violet-950/60">
        <PawPrint className="h-7 w-7 text-violet-700 dark:text-violet-300" />
      </div>
      <h1 className="mt-4 text-xl font-bold">{pet} needs a bit of extra work</h1>
      <p className="mt-1 text-sm text-muted-foreground">{salonName}</p>

      {reason && (
        <p className="mt-4 rounded-2xl bg-muted/60 px-4 py-3 text-left text-sm leading-6">{reason}</p>
      )}

      <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 text-left dark:border-violet-900 dark:bg-violet-950/40">
        {lines.map((line, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-1 text-sm">
            <span>{line.description}</span>
            <span className="shrink-0 tabular-nums">${line.amount}</span>
          </div>
        ))}
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-violet-200 pt-3 dark:border-violet-900">
          <span className="font-semibold">Extra, on top of the groom</span>
          <span className="text-2xl font-bold tabular-nums">${total}</span>
        </div>
      </div>

      <Button
        className="mt-6 h-12 w-full bg-violet-700 text-base hover:bg-violet-800"
        disabled={answer.isPending}
        onClick={() => answer.mutate({ token, decision: "approved" })}
      >
        {answer.isPending
          ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Sending…</>
          : `Yes, go ahead — add $${total}`}
      </Button>

      {/* Same height, same width, real border. See the note at the top: a
          "no" that is hard to find is a booking cancelled next time. */}
      <Button
        variant="outline"
        className="mt-3 h-12 w-full text-base"
        disabled={answer.isPending}
        onClick={() => answer.mutate({ token, decision: "declined" })}
      >
        No thanks — just the booked groom
      </Button>

      {answer.error && (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          {answer.error.message}
        </p>
      )}

      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        {deadline
          ? `If we don't hear back by about ${deadline} we'll carry on with the booked groom and you won't be charged anything extra.`
          : "If we don't hear back we'll carry on with the booked groom and you won't be charged anything extra."}
      </p>
    </>,
  );
}

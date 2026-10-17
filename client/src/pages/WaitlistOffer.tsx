import { useState } from "react";
import { useRoute } from "wouter";
import { CalendarCheck, CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Where a waitlisted client takes a slot that has come free.
 *
 * Opened from a text, on a phone, by someone who may be at work. So it
 * is one screen and one button, and it says plainly that tapping is a
 * request rather than a booking — the same slot has gone to several
 * people and the salon decides between them.
 *
 * Saying that out loud matters more than it looks. A client who thinks
 * they have booked, and then gets "sorry, it's gone", has been let down.
 * A client who knows they have asked has not.
 */
export default function WaitlistOffer() {
  const [, params] = useRoute("/slot/:token");
  const token = params?.token ?? "";
  const valid = /^[0-9a-f]{32}$/.test(token);

  const offer = trpc.waitlist.getOffer.useQuery({ token }, { enabled: valid, retry: false });
  const [claimed, setClaimed] = useState(false);

  const claim = trpc.waitlist.claim.useMutation({
    onSuccess: () => { setClaimed(true); offer.refetch(); },
  });

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-violet-950 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 text-center shadow-2xl sm:p-8">{children}</div>
    </main>
  );

  if (!valid || offer.error) {
    return shell(
      <>
        <ShieldCheck className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
        <h1 className="mt-3 text-lg font-bold">This link is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please contact the salon.</p>
      </>,
    );
  }

  if (offer.isLoading || !offer.data) {
    return shell(<p className="py-8 text-sm text-muted-foreground">Loading…</p>);
  }

  if (!offer.data.ok) {
    return shell(
      <>
        <Clock3 className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" />
        <h1 className="mt-3 text-lg font-bold">
          {offer.data.reason === "already_claimed" ? "You've asked for this one" : "This spot has gone"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{offer.data.message}</p>
      </>,
    );
  }

  const { firstName, petName, salonName, staffName, whenLabel, durationMinutes } = offer.data;

  if (claimed) {
    return shell(
      <>
        <div className="mx-auto w-fit rounded-2xl bg-emerald-400/20 p-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Thanks, {firstName}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          We've asked {salonName} to hold {whenLabel} for {petName}. They'll confirm shortly —
          this spot went to a few people on the waitlist, so it isn't booked until they say so.
        </p>
      </>,
    );
  }

  return (
    <>
      {shell(
        <>
          <div className="mx-auto w-fit rounded-2xl bg-violet-100 p-3 dark:bg-violet-950/60">
            <CalendarCheck className="h-7 w-7 text-violet-700 dark:text-violet-300" />
          </div>
          <h1 className="mt-4 text-xl font-bold">A spot has come up for {petName}</h1>

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 text-left dark:border-violet-900 dark:bg-violet-950/40">
            <p className="text-lg font-semibold">{whenLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {staffName ? `With ${staffName} · ` : ""}About {durationMinutes} minutes · {salonName}
            </p>
          </div>

          <Button
            className="mt-6 h-12 w-full bg-violet-700 text-base hover:bg-violet-800"
            disabled={claim.isPending}
            onClick={() => claim.mutate({ token })}
          >
            {claim.isPending
              ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Asking…</>
              : "Yes please — I'd like this spot"}
          </Button>

          {claim.error && (
            <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              {claim.error.message}
            </p>
          )}

          {/* Said before they tap, not after. A client who believes they
              have booked and then loses the slot has been let down; one
              who knows they have asked has not. */}
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            We offer spots to a few people at once, so this isn't booked until the salon confirms.
            If someone beats you to it you'll stay on the waitlist for the next one.
          </p>
        </>,
      )}
    </>
  );
}

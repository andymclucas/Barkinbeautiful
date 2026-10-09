import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { Scissors, Sparkles, PawPrint, CalendarClock, Phone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getActiveTimeZone } from "@/lib/timezone";
import { groomCardConditions, groomCardMoods, groomCardRating } from "@shared/groomingCard";

/**
 * A dog's grooming card, as the owner opens it from a link.
 *
 * Reached at /card/:token with no sign-in — the token in the URL is the
 * authorisation, the same bargain the Pet Tracker link makes. The server only
 * resolves a SENT card and never selects `groomerNotes`; see `getShared`.
 *
 * This is the client's keepsake, not an admin screen, so it is built to be
 * read on a phone one-handed and to be worth showing someone: a drag-to-compare
 * before and after, the groomer's note, and the check-over the salon did.
 */

function cardDate(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-AU", {
    timeZone: getActiveTimeZone(),
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Before and after under a draggable divider.
 *
 * Two photos side by side make you look twice to see what changed; one sliding
 * over the other puts the change under your thumb. Falls back to whichever
 * single photo exists, because plenty of cards have only an after.
 */
function BeforeAfter({ before, after, petName }: { before: string | null; after: string | null; petName: string }) {
  const [position, setPosition] = useState(55);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const move = (clientX: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      setPosition(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
    };
    const onMouse = (event: MouseEvent) => dragging.current && move(event.clientX);
    const onTouch = (event: TouchEvent) => dragging.current && move(event.touches[0]!.clientX);
    const stop = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  if (!before || !after) {
    const only = after ?? before;
    if (!only) return null;
    return (
      <img
        src={only}
        alt={`${petName} after grooming`}
        className="aspect-[4/3] w-full rounded-2xl object-cover shadow-lg"
      />
    );
  }

  return (
    <figure className="space-y-2">
      <div
        ref={frame}
        className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden rounded-2xl shadow-lg"
        onMouseDown={() => { dragging.current = true; }}
        onTouchStart={() => { dragging.current = true; }}
      >
        <img src={after} alt={`${petName} after grooming`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
          {/* Fixed to the frame's width so the image does not squash as the
              divider moves — it is a window onto the photo, not a resize. */}
          <img
            src={before}
            alt={`${petName} before grooming`}
            draggable={false}
            className="absolute inset-0 h-full object-cover"
            style={{ width: frame.current?.offsetWidth ?? "100%", maxWidth: "none" }}
          />
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Before</span>
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">After</span>
        <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${position}%` }}>
          <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-violet-700 shadow-lg">
            <Scissors className="h-4 w-4" />
          </span>
        </div>
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">Drag to compare</figcaption>
    </figure>
  );
}

export default function GroomingCard() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const { data: card, isLoading, error } = trpc.groomingReports.getShared.useQuery(
    { token },
    { enabled: Boolean(token), retry: false },
  );

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-gradient-to-br from-violet-50 via-background to-pink-50 dark:from-violet-950/40 dark:to-pink-950/30">
        <p className="animate-pulse text-sm text-muted-foreground">Fetching the card…</p>
      </main>
    );
  }

  if (error || !card) {
    return (
      <main className="grid min-h-screen place-items-center bg-gradient-to-br from-violet-50 via-background to-pink-50 p-6 dark:from-violet-950/40 dark:to-pink-950/30">
        <div className="max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
          <PawPrint className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-lg font-bold">This card is not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The link may have expired or been mistyped. Ask the salon to send it again.
          </p>
        </div>
      </main>
    );
  }

  // Every field is optional: the payload comes through the client-safe
  // whitelist in shared/groomingCard.ts, which types what it returns as a
  // Partial. A card missing a photo or a rating is normal, not an error.
  const petName = card.petName ?? "Your dog";
  const moods = groomCardMoods(card.mood);
  const rating = groomCardRating(card.overallRating);
  const conditions = groomCardConditions(card);
  const service = (card.serviceType ?? "").replace(/_/g, " ");

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 via-background to-pink-50 pb-16 dark:from-violet-950/40 dark:to-pink-950/30">
      <div className="mx-auto w-full max-w-xl px-4">
        <header className="pt-10 pb-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{card.salonName}</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            <span className="text-primary">{petName}</span>&rsquo;s
            <br />Grooming Card
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{cardDate(card.appointmentDate)}</p>
        </header>

        <div className="space-y-5">
          {(card.beforePhotoUrl || card.afterPhotoUrl) && (
            <BeforeAfter before={card.beforePhotoUrl ?? null} after={card.afterPhotoUrl ?? null} petName={petName} />
          )}

          {(service || card.groomerName) && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Today we had</p>
              <p className="mt-1 text-lg font-bold capitalize">{service || "A groom"}</p>
              {card.groomerName && <p className="mt-0.5 text-sm text-muted-foreground">with {card.groomerName}</p>}
              {rating && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> {rating}
                </p>
              )}
            </section>
          )}

          {moods.length > 0 && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">How {petName} was</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {moods.map((mood) => (
                  <span key={mood} className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary">
                    {mood}
                  </span>
                ))}
              </div>
            </section>
          )}

          {card.additionalNote && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">A note from your groomer</p>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{card.additionalNote}</p>
            </section>
          )}

          {conditions.length > 0 && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">We checked</p>
              <dl className="mt-2 divide-y">
                {conditions.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="text-sm font-semibold">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {/* Carried across from the emailed card deliberately: this names
                  ear, skin and teeth findings and must not read as clinical
                  advice. */}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                This card is not veterinary advice. For guidance on your pet&rsquo;s health, please speak to your vet.
              </p>
            </section>
          )}

          {card.recommendedFrequencyWeeks ? (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
              <CalendarClock className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1.5 text-sm text-muted-foreground">We&rsquo;d love to see {petName} again in</p>
              <p className="text-xl font-black text-primary">{card.recommendedFrequencyWeeks} weeks</p>
            </section>
          ) : null}

          <footer className="pt-2 text-center">
            <p className="text-sm font-semibold">Thanks for trusting us with {petName} 🐾</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.salonName}</p>
            {card.salonPhone && (
              <a href={`tel:${card.salonPhone}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <Phone className="h-3.5 w-3.5" /> {card.salonPhone}
              </a>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}

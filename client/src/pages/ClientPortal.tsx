import { useEffect, useRef, useState } from "react";
import { PortalInstallTip } from "@/components/PortalInstallTip";
import { PortalSignInLinkForm } from "@/components/PortalSignInLinkForm";
import { useLocation, useParams } from "wouter";
import { clientFacingPortalError } from "@shared/clientFacingError";
import { formatMoney } from "@shared/portalBilling";
import { groomCardConditions, groomCardMoods, groomCardRating } from "@shared/groomingCard";
import { PORTAL_CHAT_DISCLOSURE, PORTAL_PERSON_REQUEST } from "@shared/portalChat";
import { GuapoAvatar } from "@/components/GuapoAvatar";
import { sortBookingsForBucket } from "@shared/bookingBuckets";
import { clientFacingStage, isGroomInProgress, stageIcon, stageColourFor } from "@shared/groomingStage";
import { GroomProgressBar } from "@/components/GroomProgressBar";
import { CalendarDays, Dog, FileDown, MessageCircle, Send, X, Heart, Mail, Phone, Scissors, ShieldCheck, Wallet, History as HistoryIcon, PencilLine, XCircle, CreditCard, Loader2, TriangleAlert, Lock, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/DateField";
import { toast } from "sonner";
import { getActiveTimeZone } from "@/lib/timezone";
import { brisbaneDateKey } from "@shared/localDateTime";

import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";
import { AgreementGate, type GateAgreement } from "@/components/portal/AgreementGate";
type PortalPet = { id: number; name: string; breed: string | null; species: string; status: string };
type PortalAppointment = { id: number; scheduledStart: Date | string; scheduledEnd: Date | string; serviceType: string; status: string; workflowState: string; petId: number; petName: string; petWeightKg: string | number | null; staffId: number | null; staffName: string | null };
type PortalMembership = { id: number; petId: number | null; name: string; tier: string; status: string; nextBillingDate: Date | string | null };
type PortalGroomingCard = { id: number; petId: number; petName: string; appointmentDate: Date | string; overallRating: string | null; mood: string | null; additionalNote: string | null; beforePhotoUrl: string | null; afterPhotoUrl: string | null; recommendedFrequencyWeeks: number | null; coatCondition: string | null; skinCondition: string | null; eyeCondition: string | null; earCondition: string | null; nailCondition: string | null; teethCondition: string | null; serviceType: string | null; groomerName: string | null; sentAt: Date | string | null; shareToken?: string | null };
type PortalInvoiceRow = { id: number; invoiceNumber: string | null; total: string | null; status: string | null; paymentMethod: string | null; paidAt: string | Date | null; dueAt: string | Date | null; createdAt: string | Date | null; amountOwing?: number | null; payable?: boolean };
type PortalPaymentRow = { key: string; source: "invoice" | "membership" | "appointment"; amount: number; at: string | Date | number; method: string | null; description: string };

type PortalData = { pendingAgreements?: GateAgreement[]; salon: { name: string; phone: string | null; email: string | null }; client: { firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null }; pets: PortalPet[]; appointments: PortalAppointment[]; memberships: PortalMembership[]; groomingCards: PortalGroomingCard[]; storeCreditBalance: string; invoices: PortalInvoiceRow[]; payments: PortalPaymentRow[] };

const SERVICE_LABELS: Record<string, string> = {
  classic_groom: "Classic Groom", styled_groom: "Styled Groom", bath_only: "Bath",
  fft: "FFT (Face, Feet & Hygiene Tidy)", nail_trim: "Nail Trim", daycare: "Daycare", deshed: "De-shed", other: "Other",
};

function portalDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Not scheduled";
}

/** "Tue 5 Jan" for a "YYYY-MM-DD" salon date. Noon, so no zone can shift the day. */
function portalShortDay(key: string) {
  return new Date(`${key}T12:00:00+10:00`).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short" });
}

function portalDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Invoices and payments, as a client would want to check them against their
 * own bank statement. Recent first, with the rest behind an expander: a
 * long-standing client has dozens and almost always wants the last few.
 */
/**
 * The client's conversation with the salon, as a bubble in the corner.
 *
 * Deliberately not a card in the page flow: a client opens their portal to
 * check a booking, and the moment they want to ask something they should not
 * have to scroll looking for where to ask. So it sits where every support
 * chat sits, bottom right, out of the way until wanted.
 *
 * The greeting is rendered, not stored. An empty thread shows "Hi, how can I
 * help you today?" without writing a row, so the salon's inbox does not fill
 * with conversations nobody actually started.
 *
 * The automated reply is labelled "Assistant" on every message and the
 * disclosure sits under the composer, so a client knows what they are
 * talking to before they type. Anything it will not touch — prices,
 * bookings, anything health-related — comes back as a promise that a person
 * will reply. See shared/portalChat.ts.
 */
/**
 * The client's own card, managed by the client.
 *
 * Andy, 08/10/2026: "add the 'Add Payment Details' section in the client
 * portal for a client to be able to do this themselves manually at anytime
 * if they were to change a card. Their card could be expired, lost, stolen
 * etc." Without this the only route to a new card is ringing the salon and
 * waiting for somebody to send a link.
 *
 * The button goes to Stripe's own hosted page. No card number is typed into
 * Groomigo, here or anywhere else, which is what keeps the salon out of PCI
 * scope — and it means this screen can say so honestly, which is most of
 * what makes a client willing to use it.
 */
function PortalPaymentMethodCard({ token, readOnly }: { token?: string; readOnly?: boolean }) {
  const status = trpc.clientPortal.getMyPaymentMethod.useQuery(
    { token },
    { enabled: !readOnly, retry: false },
  );
  const link = trpc.clientPortal.createMyCardSetupLink.useMutation({
    onSuccess: ({ url }) => {
      // Remember where to come back to: Stripe returns everyone to
      // /portal/card-saved, which for a link-only client is otherwise a
      // dead end at the sign-in page.
      try {
        sessionStorage.setItem("portalReturnTo", window.location.pathname + window.location.search);
      } catch { /* private window, or storage blocked — the result page copes */ }
      window.location.href = url;
    },
    onError: (error) => toast.error(error.message),
  });

  const card = status.data;
  const needsCard = Boolean(card && (!card.hasCard || card.expired));

  return (
    <Card className={needsCard ? "border-amber-300 dark:border-amber-900/60" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" /> Payment details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {readOnly && (
          <p className="text-sm text-muted-foreground">
            The client manages their own card here. Not available in preview.
          </p>
        )}

        {!readOnly && status.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your payment details…
          </p>
        )}

        {!readOnly && card && (
          <>
            {card.hasCard ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold">{card.description ?? "A card is saved"}</p>
                {card.expired ? (
                  <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    This card has expired. Please add a new one so your grooming visits aren&rsquo;t interrupted.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This is the card we use for your membership.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {card.hasMembership
                  ? "You don't have a card saved with us yet. Adding one keeps your membership running without anyone having to chase a payment."
                  : "You don't have a card saved with us yet."}
              </p>
            )}

            <Button
              onClick={() => link.mutate({ token })}
              disabled={link.isPending}
              variant={card.hasCard && !card.expired ? "outline" : "default"}
              className="w-full gap-2 sm:w-auto"
            >
              {link.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening secure page…</>
                : <><Lock className="h-4 w-4" /> {card.hasCard ? "Update your card" : "Add payment details"}</>}
            </Button>

            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                You&rsquo;ll be taken to Stripe, our payment provider, to enter your card on their secure page.
                Barkin&rsquo; Beautiful never sees or stores your full card number. Nothing is charged when you
                save a card.
              </span>
            </p>
          </>
        )}

        {!readOnly && status.error && (
          <p className="text-sm text-muted-foreground">
            We couldn&rsquo;t load your payment details just now. Please refresh, or give the salon a call.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PortalChatBubble({ token, readOnly, clientFirstName }: { token?: string; readOnly?: boolean; clientFirstName?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = trpc.clientPortal.getChat.useQuery(
    { token },
    { enabled: !readOnly, refetchInterval: open ? 15000 : 60000 },
  );
  const markRead = trpc.clientPortal.markChatRead.useMutation({ onSuccess: () => chat.refetch() });
  const send = trpc.clientPortal.sendChatMessage.useMutation({
    onSuccess: () => { setDraft(""); chat.refetch(); inputRef.current?.focus(); },
    onError: (e) => toast.error(e.message),
  });

  const messages = chat.data?.messages ?? [];
  const unread = chat.data?.unread ?? 0;

  // Opening the panel is reading it, and a new reply should not leave the
  // client staring at the top of the thread.
  useEffect(() => { if (open && unread > 0) markRead.mutate({ token }); }, [open, unread]);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  if (readOnly) return null;

  const when = (v: string | Date) =>
    new Date(v).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate({ token, body });
  };

  return (
    <>
      {/* The panel. Anchored to the bubble on a desktop, and on a phone it
          takes the width it needs with a gutter either side. */}
      {open && (
        <div
          role="dialog"
          aria-label="Message the salon"
          className="fixed bottom-24 right-4 z-50 flex max-h-[min(32rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:right-6 sm:w-96"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 bg-gradient-to-br from-violet-700 to-violet-500 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <GuapoAvatar size={36} />
              <div className="min-w-0">
                <p className="text-sm font-bold">Guapo · Barkin&apos; Beautiful</p>
                <p className="text-[11px] opacity-85">Ask Guapo, or talk to the team. We reply during salon hours.</p>
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 shrink-0 text-white hover:bg-white/20 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-muted/30 p-3">
            {/* Shown, never stored — see the note above the component. */}
            <div className="flex items-end justify-start gap-1.5">
              <GuapoAvatar size={26} />
              <div className="max-w-[85%] rounded-2xl border bg-card px-3.5 py-2 text-sm">
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">Guapo</p>
                <p className="leading-relaxed">
                  Hola{clientFirstName ? ` ${clientFirstName}` : ""}, I&rsquo;m Guapo! How can I help you today?
                </p>
              </div>
            </div>
            {messages.map(m => {
              const mine = m.sender === "client";
              return (
                <div key={m.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {m.sender === "assistant" && <GuapoAvatar size={26} />}
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
                    {!mine && (
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
                        {m.sender === "assistant" ? "Guapo" : (m.staffName ?? "Barkin' Beautiful")}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "opacity-70" : "text-muted-foreground"}`}>{when(m.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            {send.isPending && (
              <p className="px-1 text-xs text-muted-foreground">Guapo is typing…</p>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t bg-card p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={draft}
                placeholder="Type a message…"
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              />
              <Button onClick={submit} disabled={!draft.trim() || send.isPending} size="icon" aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold"
              disabled={send.isPending}
              onClick={() => send.mutate({ token, body: PORTAL_PERSON_REQUEST, wantsPerson: true })}
            >
              Talk to a person
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">{PORTAL_CHAT_DISCLOSURE}</p>
          </div>
        </div>
      )}

      <Button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? "Close chat" : "Message the salon"}
        className="fixed bottom-6 right-4 z-50 h-14 w-14 rounded-full p-0 shadow-xl sm:right-6"
      >
        {open ? <X className="h-6 w-6" /> : <GuapoAvatar size={56} className="rounded-full" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </Button>
    </>
  );
}

/**
 * A grooming card in the list, as something to tap.
 *
 * The portal used to render every card fully expanded and stacked, so a client
 * with four dogs scrolled past four complete reports to reach their invoices.
 * These are a summary you tap to open the full card at /card/:token — the same
 * page the salon texts, so a client sees one thing in both places.
 *
 * Needs a token, which a card only has once it has been sent. Anything older
 * falls back to the inline detail below rather than becoming an unclickable
 * stub.
 */
function GroomingCardLink({ card }: { card: PortalGroomingCard }) {
  const rating = groomCardRating(card.overallRating);
  const service = (card.serviceType ?? "").replace(/_/g, " ");
  return (
    <a
      href={`/card/${card.shareToken}`}
      className="group flex items-center gap-3 rounded-2xl border bg-card p-3 transition hover:border-primary/40 hover:shadow-md"
    >
      {card.afterPhotoUrl
        ? <img src={card.afterPhotoUrl} alt={card.petName} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Scissors className="h-6 w-6" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{card.petName}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {portalDate(card.appointmentDate)}{service ? ` \u00b7 ${service}` : ""}
        </span>
        {rating && <span className="mt-1 inline-block truncate text-xs font-semibold text-primary">{rating}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </a>
  );
}

/**
 * A grooming card as the client reads it.
 *
 * Mirrors the card the salon emails and prints, which is the whole point:
 * a client who opens the portal should see the same check-over as the one
 * in their inbox. Before this, the portal showed the after photo, one note
 * and the return frequency, and silently dropped the rating, the mood, the
 * before photo and every condition the groomer recorded.
 *
 * The veterinary disclaimer is carried across deliberately. The card names
 * ear, skin and teeth findings, and must not read as a clinical opinion.
 *
 * groomerNotes is deliberately NOT shown. It is the salon's internal note on
 * the dog, and two tests assert it never reaches the portal payload. The
 * client-facing note is additionalNote, rendered above as "a note from your
 * groomer".
 */
function GroomingCardDetail({ card }: { card: PortalGroomingCard }) {
  const conditions = groomCardConditions(card);
  const moods = groomCardMoods(card.mood);
  const rating = groomCardRating(card.overallRating);
  const service = (card.serviceType ?? "").replace(/_/g, " ");

  return (
    <article className="overflow-hidden rounded-2xl border bg-card">
      <header className="bg-gradient-to-br from-violet-700 to-violet-500 px-5 py-4 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">Grooming card</p>
        <h3 className="mt-1 text-lg font-extrabold">{card.petName}</h3>
        <p className="mt-0.5 text-xs opacity-90">
          {portalDate(card.appointmentDate)}
          {card.groomerName ? ` · Groomed by ${card.groomerName}` : ""}
        </p>
      </header>

      <div className="space-y-4 p-5">
        {service && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Today&apos;s service</p>
            <p className="text-sm font-semibold capitalize">{service}</p>
          </div>
        )}

        {(card.beforePhotoUrl || card.afterPhotoUrl) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {card.beforePhotoUrl && (
              <figure>
                <figcaption className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Before</figcaption>
                <img src={card.beforePhotoUrl} alt={`${card.petName} before grooming`} className="h-44 w-full rounded-lg border object-cover" />
              </figure>
            )}
            {card.afterPhotoUrl && (
              <figure>
                <figcaption className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">After</figcaption>
                <img src={card.afterPhotoUrl} alt={`${card.petName} after grooming`} className="h-44 w-full rounded-lg border object-cover" />
              </figure>
            )}
          </div>
        )}

        {rating && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Overall</p>
            <p className="text-base font-extrabold text-primary">{rating}</p>
          </div>
        )}

        {moods.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Mood</p>
            <div className="flex flex-wrap gap-1.5">
              {moods.map(m => <Badge key={m} variant="secondary" className="font-normal">{m}</Badge>)}
            </div>
          </div>
        )}

        {card.additionalNote && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">A note from your groomer</p>
            <p className="whitespace-pre-wrap rounded-xl bg-muted/50 px-3.5 py-3 text-sm leading-relaxed">{card.additionalNote}</p>
          </div>
        )}

        {conditions.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">We checked</p>
            <dl className="divide-y rounded-xl border">
              {conditions.map(row => (
                <div key={row.label} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-semibold">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {card.recommendedFrequencyWeeks ? (
          <div className="rounded-xl bg-primary/10 px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">Recommended frequency</p>
            <p className="mt-0.5 text-base font-extrabold text-primary">Every {card.recommendedFrequencyWeeks} weeks</p>
          </div>
        ) : null}

        <p className="border-t pt-3 text-[10px] leading-relaxed text-muted-foreground">
          This grooming card does not constitute veterinary advice. Please contact a veterinarian for professional health guidance.
        </p>
      </div>
    </article>
  );
}

/**
 * The client's invoices, and nothing else about money.
 *
 * Deliberately quiet. This used to lead with "Outstanding" and "Paid to
 * date" tiles and a payments timeline, which Andy found confusing for
 * clients and which were also wrong: "Paid to date" summed every invoice
 * regardless of whether the groom had happened, so clients with historic
 * imported invoices saw a total far above what they had actually paid.
 *
 * A running total is not what a client needs from a grooming portal. They
 * need to find a particular invoice and keep a copy. So this is a collapsed
 * list they can open if they want one, with a printable copy per invoice.
 *
 * No total is shown here on purpose. If one is ever reintroduced it must be
 * computed from completed work only — see the portal billing investigation
 * on 05/10/2026.
 */
function InvoicesSection({ invoices, salon, client, token, readOnly }: { invoices: PortalInvoiceRow[]; salon: PortalData["salon"]; client: PortalData["client"]; token?: string; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  /*
   * Pay now (Andy, 11/11/2026). Only bills the server marked payable —
   * Groomigo's own, open, with money owing (shared/portalInvoicePay.ts).
   * The amount is worked out again when they press it, and Stripe's own
   * page takes the card. Not offered in staff preview.
   */
  const pay = trpc.clientPortal.payMyInvoice.useMutation({
    onSuccess: (r) => {
      try { sessionStorage.setItem("portalReturnTo", window.location.pathname + window.location.search); } catch { /* storage may be blocked */ }
      window.location.href = r.url;
    },
    onError: (e) => toast.error(e.message),
  });
  const payable = invoices.filter((i) => i.payable && (i.amountOwing ?? 0) > 0);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? invoices : invoices.slice(0, 5);

  const when = (value: string | Date | number | null) =>
    value ? new Date(value).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", year: "numeric" }) : "—";

  // Printed through the browser rather than a server-rendered file: it is the
  // same approach the grooming report already uses, needs no PDF dependency,
  // and "Save as PDF" is in every print dialog on desktop and iOS.
  const printInvoice = (invoice: PortalInvoiceRow) => {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string));
    const paid = (invoice.status ?? "").toLowerCase() === "paid";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(invoice.invoiceNumber || `Invoice ${invoice.id}`)}</title>
<style>
 body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c1917;margin:40px;max-width:720px}
 h1{font-size:20px;margin:0 0 4px} .muted{color:#78716c;font-size:13px}
 .row{display:flex;justify-content:space-between;gap:24px;margin-top:28px}
 table{width:100%;border-collapse:collapse;margin-top:28px}
 th,td{text-align:left;padding:10px 0;border-bottom:1px solid #e7e5e4;font-size:14px}
 td.amt,th.amt{text-align:right}
 .total{font-size:18px;font-weight:700}
 .badge{display:inline-block;border:1px solid #d6d3d1;border-radius:999px;padding:2px 10px;font-size:12px}
 @media print{body{margin:16px}}
</style></head><body>
 <h1>${esc(salon.name)}</h1>
 <div class="muted">${[salon.phone, salon.email].filter(Boolean).map(esc).join(" &middot; ")}</div>
 <div class="row">
  <div><div class="muted">Billed to</div><div><strong>${esc([client.firstName, client.lastName].filter(Boolean).join(" "))}</strong></div>
   <div class="muted">${esc(client.email ?? "")}</div></div>
  <div style="text-align:right">
   <div class="muted">Invoice</div><div><strong>${esc(invoice.invoiceNumber || `#${invoice.id}`)}</strong></div>
   <div class="muted">${paid ? `Paid ${esc(when(invoice.paidAt))}` : `Issued ${esc(when(invoice.createdAt))}`}</div>
   <div style="margin-top:6px"><span class="badge">${paid ? "Paid" : esc(invoice.status ?? "Due")}</span></div>
  </div>
 </div>
 <table><thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead>
  <tbody><tr><td>Grooming services</td><td class="amt">${esc(formatMoney(invoice.total))}</td></tr></tbody>
  <tfoot><tr><td class="total">Total</td><td class="amt total">${esc(formatMoney(invoice.total))}</td></tr></tfoot>
 </table>
</body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        {payable.length > 0 && (
          // Up front, not inside the folded list: a bill to pay is the one
          // thing in here a client should not have to go looking for.
          <div className="mb-3 space-y-2">
            {payable.map((invoice) => (
              <div key={`pay-${invoice.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
                <span className="min-w-0">
                  <span className="block font-medium">{formatMoney(String(invoice.amountOwing))} to pay</span>
                  <span className="block text-xs text-muted-foreground">{invoice.invoiceNumber || `Invoice #${invoice.id}`} · issued {when(invoice.createdAt)}</span>
                </span>
                {readOnly ? (
                  <span className="text-xs text-muted-foreground">Pay button shown to the client</span>
                ) : (
                  <Button size="sm" className="gap-2" disabled={pay.isPending}
                    onClick={() => pay.mutate({ token, invoiceId: invoice.id })}>
                    {pay.isPending && pay.variables?.invoiceId === invoice.id
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening secure page…</>
                      : <><Lock className="h-4 w-4" /> Pay {formatMoney(String(invoice.amountOwing))}</>}
                  </Button>
                )}
              </div>
            ))}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              You pay on Stripe's secure page. {salon.name} never sees your full card number.
            </p>
          </div>
        )}
        {invoices.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No invoices yet.</p>
        ) : !open ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
            View my invoices ({invoices.length})
          </Button>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-1">
              {visible.map((invoice) => {
                const paid = (invoice.status ?? "").toLowerCase() === "paid";
                return (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{invoice.invoiceNumber || `Invoice #${invoice.id}`}</span>
                      <span className="block text-xs text-muted-foreground">
                        {paid ? `Paid ${when(invoice.paidAt)}` : `Issued ${when(invoice.createdAt)}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold">{formatMoney(invoice.total)}</span>
                      <Badge variant="outline" className={paid ? "text-emerald-700 dark:text-emerald-400" : ""}>
                        {/* "draft" is the salon's word, not the client's. */}
                        {paid ? "Paid" : (invoice.status ?? "").toLowerCase() === "cancelled" ? "Cancelled" : "Due"}
                      </Badge>
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => printInvoice(invoice)}>
                        <FileDown className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
            {invoices.length > 5 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(v => !v)}>
                {showAll ? "Show fewer" : `Show all ${invoices.length} invoices`}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>Hide invoices</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The client's own contact details, and the form that changes them.
 *
 * Only the fields a client should own: name, email, phone, address. The
 * email they sign in with is not touched here — see updateMyProfile.
 */
function YourDetailsCard({ client, onSaved }: {
  client: { firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null };
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: client.firstName ?? "",
    lastName: client.lastName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
  });

  const save = trpc.clientPortal.updateMyProfile.useMutation({
    onSuccess: () => {
      toast.success("Your details have been updated");
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  const openEditor = () => {
    setForm({
      firstName: client.firstName ?? "",
      lastName: client.lastName ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
    });
    setOpen(true);
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value })),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <PencilLine className="h-5 w-5 text-primary" /> Your details
        </CardTitle>
        <Button variant="outline" size="sm" onClick={openEditor}>Edit</Button>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Name</p>
          <p className="font-medium">{[client.firstName, client.lastName].filter(Boolean).join(" ") || "Not provided"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Phone</p>
          <p className="font-medium">{client.phone || "Not provided"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="break-words font-medium">{client.email || "Not provided"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Address</p>
          <p className="font-medium">{client.address || "Not provided"}</p>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Your details</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="portal-first-name">First name</Label>
                <Input id="portal-first-name" autoComplete="given-name" {...field("firstName")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="portal-last-name">Last name</Label>
                <Input id="portal-last-name" autoComplete="family-name" {...field("lastName")} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portal-phone">Mobile number</Label>
              <Input id="portal-phone" inputMode="tel" autoComplete="tel" placeholder="0412 345 678" {...field("phone")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portal-email">Email</Label>
              <Input id="portal-email" type="email" autoComplete="email" {...field("email")} />
              <p className="text-xs text-muted-foreground">
                This is where we send reminders. It does not change the email you sign in with &mdash; ask the salon if you need that changed.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portal-address">Address</Label>
              <Input id="portal-address" autoComplete="street-address" {...field("address")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Pay for today's appointment (Andy, 11/11/2026).
 *
 * Only on the day, only once the bill is finished, and at least the bill.
 * Anything over goes on their account as store credit for next time or for
 * retail — Andy's example: a $300 bill paid with $500 leaves $200 credit.
 * The amount is checked on the server when they press Pay, and Stripe's own
 * page takes the card.
 */
function TodaysBillCard({ token, readOnly }: { token?: string; readOnly?: boolean }) {
  const bill = trpc.clientPortal.todaysBill.useQuery({ token }, { enabled: !readOnly, retry: false });
  const [amount, setAmount] = useState<string>("");
  const pay = trpc.clientPortal.payTodaysBill.useMutation({
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e) => toast.error(e.message),
  });
  const data = bill.data;
  if (readOnly || !data || data.owed <= 0) return null;

  const money = (n: number) => "$" + n.toFixed(2);
  const typed = amount.trim() === "" ? data.owed : Number(amount);
  const valid = Number.isFinite(typed) && typed >= data.owed && typed <= data.max;
  const credit = valid ? Math.round((typed - data.owed) * 100) / 100 : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Today's appointment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          {data.dogs.map((d, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{d.petName}{d.coveredByMembership && d.owed === 0 ? <span className="text-muted-foreground"> · covered by membership</span> : null}</span>
              <span className="tabular-nums">{money(d.owed)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t pt-1 font-semibold">
            <span>To pay today</span><span className="tabular-nums">{money(data.owed)}</span>
          </li>
        </ul>
        {!data.ready ? (
          <p className="text-sm text-muted-foreground">Your bill for today isn't finished yet. Check back after your groom, or pay at the counter.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="portal-pay-amount" className="text-sm font-medium">Amount to pay</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="portal-pay-amount"
                  inputMode="decimal"
                  className="max-w-[10rem]"
                  placeholder={data.owed.toFixed(2)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {credit > 0
                  ? money(credit) + " more than today's bill will go on your account as credit for your next visit or anything from our shop."
                  : "Pay more than today's bill if you like — the extra goes on your account as credit."}
              </p>
              {!valid && amount.trim() !== "" && (
                <p className="text-xs text-destructive">
                  {typed < data.owed ? "Please pay at least " + money(data.owed) + "." : "The most you can pay here is " + money(data.max) + "."}
                </p>
              )}
            </div>
            <Button className="w-full gap-2 sm:w-auto" disabled={!valid || pay.isPending}
              onClick={() => pay.mutate({ token, amountCents: Math.round(typed * 100) })}>
              {pay.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening secure page…</> : <><Lock className="h-4 w-4" /> Pay {money(valid ? typed : data.owed)}</>}
            </Button>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              You pay on Stripe's secure page. We never see your full card number.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientPortal() {
  // This page is sent to the salon's own clients, so it wears the
  // salon's colours rather than stock Groomigo ones.
  usePublicBrandTheme();
  const { token, previewClientId } = useParams<{ token?: string; previewClientId?: string }>();
  const [, navigate] = useLocation();
  // Admin preview: same payload, no session, nothing changed on the client's
  // end. Client-only actions are hidden rather than offered and failing.
  const previewId = previewClientId ? Number(previewClientId) : null;
  const isPreview = Number.isFinite(previewId) && (previewId ?? 0) > 0;
  const preview = trpc.clientPortal.previewPortal.useQuery(
    { clientId: previewId ?? 0 },
    { enabled: isPreview, retry: false },
  );
  // retry: false matters here. A bad, expired or malformed token can never
  // succeed, but the default three retries with backoff left the client
  // staring at a loading skeleton for ~7 seconds before the error appeared —
  // which reads as the site hanging, right after they entered a card.
  // Poll only while a dog is actually in the salon. A client watching the
  // progress bar wants it to move without refreshing; a client reading
  // their invoice history does not, and every portal page left open on a
  // phone would otherwise poll the database all day for nothing.
  const livePolling = (query: { state: { data?: unknown } }) => {
    const portal = query.state.data as PortalData | undefined;
    const active = portal?.appointments?.some(appointment => isGroomInProgress(appointment.workflowState));
    return active ? 30_000 : false;
  };

  const tokenPortal = trpc.clientPortal.getPortal.useQuery({ token: token ?? "" }, { enabled: Boolean(token) && !isPreview, retry: false, refetchInterval: livePolling });
  const accountPortal = trpc.clientPortal.getMyPortal.useQuery(undefined, { enabled: !token && !isPreview, retry: false, refetchInterval: livePolling });
  const logout = trpc.clientPortal.logout.useMutation({ onSuccess: () => navigate("/portal/login") });
  // An expired access link on a phone that is still signed in opens the
  // portal from the session rather than a dead end (12/11/2026, see
  // ClientPortalSetup for why).
  const tokenFailed = Boolean(token) && !isPreview && Boolean(tokenPortal.error);
  const fallbackSession = trpc.clientPortal.me.useQuery(undefined, { enabled: tokenFailed, retry: false });
  useEffect(() => {
    if (tokenFailed && fallbackSession.data) navigate("/portal", { replace: true });
  }, [tokenFailed, fallbackSession.data, navigate]);
  const data = (isPreview ? preview.data : token ? tokenPortal.data : accountPortal.data) as PortalData | undefined;
  const isLoading = isPreview ? preview.isLoading : token ? tokenPortal.isLoading : accountPortal.isLoading;
  const error = isPreview ? preview.error : token ? tokenPortal.error : accountPortal.error;
  const refetch = () => (isPreview ? preview.refetch() : token ? tokenPortal.refetch() : accountPortal.refetch());

  const [rescheduleTarget, setRescheduleTarget] = useState<PortalAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PortalAppointment | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(""); // "" = not chosen yet, "any" = no preference, else staffId
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [showAllHistory, setShowAllHistory] = useState(false);

  const openReschedule = (appt: PortalAppointment) => {
    setRescheduleTarget(appt);
    setSelectedStaffId(appt.staffId ? String(appt.staffId) : "any");
    // The salon's calendar day, not UTC's: an 8am Brisbane booking is still
    // the day before in UTC, and the picker opened on the wrong date.
    setSelectedDate(brisbaneDateKey(new Date(appt.scheduledStart)));
    setSelectedSlot("");
  };

  const groomerProfiles = trpc.clientPortal.listReschedulableStaff.useQuery({});
  // A membership or repeat booking moves only within its week, so the
  // cycle holds (shared/cycleRescheduleWindow.ts). Null for a one-off.
  const cycleWindow = trpc.clientPortal.rescheduleWindow.useQuery(
    { token: token ?? undefined, appointmentId: rescheduleTarget?.id ?? 0 },
    { enabled: !!rescheduleTarget && !isPreview },
  );
  const petWeightKg = rescheduleTarget?.petWeightKg ? Number(rescheduleTarget.petWeightKg) : 0;
  const specificSlots = trpc.clientPortal.listAvailableSlots.useQuery(
    { staffId: Number(selectedStaffId), serviceType: rescheduleTarget?.serviceType as any, petWeightKg, date: selectedDate, excludeAppointmentId: rescheduleTarget?.id ?? 0 },
    { enabled: !!rescheduleTarget && !!selectedDate && selectedStaffId !== "" && selectedStaffId !== "any" }
  );
  const anyStaffSlots = trpc.clientPortal.listAvailableSlotsAnyStaff.useQuery(
    { serviceType: rescheduleTarget?.serviceType as any, petWeightKg, date: selectedDate, excludeAppointmentId: rescheduleTarget?.id ?? 0 },
    { enabled: !!rescheduleTarget && !!selectedDate && selectedStaffId === "any" }
  );
  const availableSlots = selectedStaffId === "any" ? anyStaffSlots.data : specificSlots.data;
  const slotsLoading = selectedStaffId === "any" ? anyStaffSlots.isFetching : specificSlots.isFetching;

  const rescheduleMutation = trpc.clientPortal.rescheduleAppointment.useMutation({
    onSuccess: () => { toast.success("Appointment rescheduled"); setRescheduleTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.clientPortal.cancelAppointment.useMutation({
    onSuccess: () => { toast.success("Appointment cancelled"); setCancelTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const signAgreements = trpc.clientPortal.signMyAgreements.useMutation({ onSuccess: () => refetch() });

  if (isLoading || (tokenFailed && (fallbackSession.isLoading || fallbackSession.data))) return <main className="min-h-screen bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 p-6"><div className="mx-auto max-w-4xl animate-pulse space-y-5"><div className="h-24 rounded-2xl bg-muted" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-32 rounded-xl bg-muted" />)}</div></div></main>;
  if (error || !data) return <main className="min-h-screen bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 grid place-items-center p-6"><Card className="max-w-md text-center"><CardHeader><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><CardTitle>{token ? "Portal link unavailable" : "Client sign in required"}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{clientFacingPortalError(error?.message, Boolean(token))}</p><p className="text-sm font-medium">Enter your email and we&rsquo;ll send you a link to sign in.</p><PortalSignInLinkForm autoFocus /><Button variant="ghost" className="w-full" onClick={() => navigate("/portal/login")}>Sign in with a password instead</Button></CardContent></Card></main>;

  /*
   * The agreement gate (Andy, 11/11/2026): until the service agreement is
   * signed, it is the only thing the portal shows. Not in staff preview —
   * staff are looking at the portal, not signing for the client; the
   * preview banner says what is outstanding instead.
   */
  const pendingAgreements = data.pendingAgreements ?? [];
  if (!isPreview && pendingAgreements.length > 0) {
    return <AgreementGate
      agreements={pendingAgreements}
      salonName={data.salon.name}
      firstName={data.client.firstName}
      submitting={signAgreements.isPending}
      error={signAgreements.error?.message}
      onSign={(signedName, documentIds) => signAgreements.mutate({ token: token ?? undefined, signedName, documentIds })}
    />;
  }

  // Soonest first, the same rule as the staff Bookings tab. The server
  // sends newest-first, so unsorted this read June, April, March, January
  // (Andy, 13/11/2026: "Most recent upcoming at the top").
  const upcoming = sortBookingsForBucket(
    data.appointments.filter(appointment => new Date(appointment.scheduledStart).getTime() >= Date.now() && !["cancelled", "no_show"].includes(appointment.status)),
    "upcoming",
  );
  const past = data.appointments.filter(appointment => !upcoming.includes(appointment));
  const pastVisible = showAllHistory ? past : past.slice(0, 5);
  // In preview there is no client session, so these would fail if offered.
  const canManage = (appt: PortalAppointment) => !isPreview && appt.workflowState === "scheduled" && appt.status !== "cancelled";
  const canReschedule = (appt: PortalAppointment) => canManage(appt) && new Date(appt.scheduledStart).getTime() - Date.now() >= 24 * 3600000;
  const creditBalance = Number(data.storeCreditBalance ?? 0);

  // Whatever is happening in the salon right now. A dog is "in" from
  // check-in until it is collected, which is exactly the window a client
  // keeps refreshing the page. No times are shown: the salon runs behind
  // on a bad day, and a pickup time that slips is worse than none.
  const inSalon = data.appointments.filter(appointment => isGroomInProgress(appointment.workflowState));

  return <main className="min-h-screen bg-gradient-to-br from-pink-50 dark:from-pink-950/40 via-background to-violet-50 dark:to-violet-950/40 py-8 px-4"><div className="mx-auto max-w-4xl space-y-6">
    <header className="rounded-2xl bg-primary p-6 text-primary-foreground"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm opacity-85">Welcome to</p><h1 className="font-display text-3xl font-bold">{data.salon.name}</h1><p className="mt-2 text-sm opacity-90">Hi {data.client.firstName}, here is a secure summary of your pets and grooming care.</p></div>{!token && <Button variant="outline" className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? "Signing out…" : "Sign out"}</Button>}</div></header>

    {/* Signed in on their own account: worth saving to the Home Screen. Not
        on a staff preview, and not on an access-token link. */}
    {!isPreview && !token && <PortalInstallTip />}
    {inSalon.length > 0 && <section className="space-y-3">
      {inSalon.map(appointment => {
        const stage = clientFacingStage(appointment.workflowState);
        return <Card key={`live-${appointment.id}`} className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span aria-hidden="true">{stageIcon(stage)}</span>
              {appointment.petName} is in the salon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-lg font-semibold" style={{ color: stageColourFor(stage) }}>{stage.label}</p>
              <p className="text-sm text-muted-foreground">{stage.description}</p>
            </div>
            <GroomProgressBar workflowState={appointment.workflowState} petName={appointment.petName} />
            <p className="text-xs text-muted-foreground">
              This updates as {appointment.petName} moves through the salon. We&rsquo;ll let you know as soon as
              {" "}{appointment.petName} is ready.
            </p>
          </CardContent>
        </Card>;
      })}
    </section>}

    <section className="grid gap-4 sm:grid-cols-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Your pets</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data.pets.length}</p><p className="mt-1 text-sm text-muted-foreground">{data.pets.map(pet => pet.name).join(", ") || "No pets listed"}</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Upcoming visits</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{upcoming.length}</p><p className="mt-1 text-sm text-muted-foreground">Appointments currently scheduled</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Memberships</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data.memberships.filter(membership => membership.status === "active").length}</p><p className="mt-1 text-sm text-muted-foreground">Active pet care memberships</p></CardContent></Card>
      <Card className="border-primary/20 bg-primary/5"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Store credit</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">${creditBalance.toFixed(2)}</p><p className="mt-1 text-sm text-muted-foreground">{creditBalance > 0 ? "Automatically applied to your next visits" : "No credit currently on file"}</p></CardContent></Card>
    </section>

    {isPreview && (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="font-semibold text-amber-900 dark:text-amber-200">Staff preview</p>
        <p className="text-amber-800 dark:text-amber-300">
          This is exactly what {data.client.firstName} sees. Nothing here is live for them, their access links are
          untouched, and the actions they would have are hidden.
        </p>
        {pendingAgreements.length > 0 && (
          <p className="mt-2 font-medium text-amber-900 dark:text-amber-200">
            Not yet signed: {pendingAgreements.map((a) => a.title).join(", ")}. {data.client.firstName} will be asked to sign
            before anything else when they open the portal.
          </p>
        )}
      </div>
    )}

    <TodaysBillCard token={token ?? undefined} readOnly={isPreview} />

    {!isPreview && <YourDetailsCard client={data.client} onSaved={() => refetch()} />}
    {/*
      The preview is a read-only copy of the client's own card, so it carries
      the client's heading. It said "Their details", which contradicted the
      banner directly above it promising "this is exactly what X sees" — the
      one thing a preview must not do is word itself differently from the
      page it is previewing. Only the Edit action is withheld, which the
      banner already explains.
    */}
    {isPreview && (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><PencilLine className="h-5 w-5 text-primary" /> Your details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{[data.client.firstName, data.client.lastName].filter(Boolean).join(" ") || "Not provided"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{data.client.phone || "Not provided"}</p></div>
          <div><p className="text-xs text-muted-foreground">Email</p><p className="break-words font-medium">{data.client.email || "Not provided"}</p></div>
          <div><p className="text-xs text-muted-foreground">Address</p><p className="font-medium">{data.client.address || "Not provided"}</p></div>
        </CardContent>
      </Card>
    )}

    <InvoicesSection invoices={data.invoices ?? []} salon={data.salon} client={data.client} token={token ?? undefined} readOnly={isPreview} />

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Dog className="h-5 w-5 text-primary" /> Your pets</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{data.pets.map(pet => <div key={pet.id} className="rounded-xl border bg-card p-4"><p className="font-semibold">{pet.name}</p><p className="text-sm text-muted-foreground">{pet.breed || pet.species}</p><Badge variant="outline" className="mt-2 capitalize">{pet.status}</Badge></div>)}</CardContent></Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Upcoming appointments</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length ? upcoming.map(appointment => (
          <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
            <div>
              <p className="font-semibold">{appointment.petName} · {SERVICE_LABELS[appointment.serviceType] ?? appointment.serviceType}</p>
              <p className="text-sm text-muted-foreground">{portalDateTime(appointment.scheduledStart)}{appointment.staffName ? ` with ${appointment.staffName}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="capitalize">{appointment.status}</Badge>
              {canManage(appointment) && (
                <>
                  {canReschedule(appointment) ? (
                    <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => openReschedule(appointment)}>
                      <PencilLine className="h-3.5 w-3.5" /> Reschedule
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">This appointment cannot be rescheduled online. Please call Barkin' Beautiful on (07) 3823 4567.</span>
                  )}
                  <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={() => setCancelTarget(appointment)}>
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )) : <p className="text-sm text-muted-foreground">There are no upcoming appointments in this portal.</p>}
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> Memberships</CardTitle></CardHeader><CardContent className="space-y-3">{data.memberships.length ? data.memberships.map(membership => <div key={membership.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"><div><p className="font-semibold">{membership.name}</p><p className="text-sm text-muted-foreground">{membership.status === "active" && membership.nextBillingDate ? `Next renewal: ${portalDate(membership.nextBillingDate)}` : "Please contact the salon for account details."}</p></div><Badge variant="outline" className="capitalize">{membership.tier}</Badge></div>) : <p className="text-sm text-muted-foreground">No memberships are currently shown.</p>}</CardContent></Card>

    <PortalPaymentMethodCard token={token ?? undefined} readOnly={isPreview} />

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Scissors className="h-5 w-5 text-primary" /> Grooming cards</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data.groomingCards.length
          ? data.groomingCards.map(card => card.shareToken
              ? <GroomingCardLink key={card.id} card={card} />
              : <GroomingCardDetail key={card.id} card={card} />)
          : <p className="text-sm text-muted-foreground">Approved grooming cards will appear here when the salon shares them.</p>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><HistoryIcon className="h-5 w-5 text-primary" /> Appointment history</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {past.length ? pastVisible.map(appointment => (
          <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
            <div>
              <p className="font-semibold">{appointment.petName} · {SERVICE_LABELS[appointment.serviceType] ?? appointment.serviceType}</p>
              <p className="text-sm text-muted-foreground">{portalDate(appointment.scheduledStart)}{appointment.staffName ? ` with ${appointment.staffName}` : ""}</p>
            </div>
            <Badge variant="outline" className="capitalize">{appointment.status === "cancelled" || appointment.workflowState === "cancelled" ? "Cancelled" : appointment.workflowState === "no_show" || appointment.status === "no_show" ? "No show" : "Completed"}</Badge>
          </div>
        )) : <p className="text-sm text-muted-foreground">No past appointments yet.</p>}
        {past.length > 5 && (
          <button className="text-sm font-medium text-primary" onClick={() => setShowAllHistory(!showAllHistory)}>
            {showAllHistory ? "Show fewer" : `Show all ${past.length} past appointments`}
          </button>
        )}
      </CardContent>
    </Card>

    <Card><CardContent className="flex flex-wrap items-center gap-5 py-5 text-sm text-muted-foreground"><span>Need help with an appointment?</span>{data.salon.phone && <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`tel:${data.salon.phone}`}><Phone className="h-4 w-4" /> {data.salon.phone}</a>}{data.salon.email && <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`mailto:${data.salon.email}`}><Mail className="h-4 w-4" /> {data.salon.email}</a>}</CardContent></Card>
  </div>

  <PortalChatBubble token={token ?? undefined} readOnly={isPreview} clientFirstName={data.client.firstName} />

  <Dialog open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Reschedule appointment</DialogTitle></DialogHeader>
      {rescheduleTarget && (
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">{rescheduleTarget.petName} · {SERVICE_LABELS[rescheduleTarget.serviceType] ?? rescheduleTarget.serviceType}</p>

          <div className="space-y-1.5">
            <Label>Groomer</Label>
            <Select value={selectedStaffId} onValueChange={(v) => { setSelectedStaffId(v); setSelectedSlot(""); }}>
              <SelectTrigger><SelectValue placeholder="Choose a groomer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No preferred groomer</SelectItem>
                {groomerProfiles.data?.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <DateField
              value={selectedDate}
              min={[brisbaneDateKey(new Date()), cycleWindow.data?.from ?? ""].sort().at(-1)}
              max={cycleWindow.data?.to}
              onChange={(next) => { setSelectedDate(next); setSelectedSlot(""); }}
            />
            {cycleWindow.data && (
              <p className="text-xs text-muted-foreground">
                {cycleWindow.data.intervalWeeks
                  ? `${rescheduleTarget.petName} is booked every ${cycleWindow.data.intervalWeeks} weeks, so this visit can move within its week`
                  : "This is a regular booking, so it can move within its week"}
                {" "}({portalShortDay(cycleWindow.data.from)} – {portalShortDay(cycleWindow.data.to)}). For anything else, please call the salon.
              </p>
            )}
          </div>

          {selectedStaffId && selectedDate && (
            <div className="space-y-1.5">
              <Label>Available times</Label>
              {slotsLoading ? (
                <p className="text-sm text-muted-foreground">Checking availability\u2026</p>
              ) : availableSlots && availableSlots.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {availableSlots.map(slot => {
                    const iso = new Date(slot.scheduledStart).toISOString();
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedSlot(iso)}
                        className={`rounded-md border px-2 py-1.5 text-sm ${selectedSlot === iso ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
                      >
                        {new Date(slot.scheduledStart).toLocaleTimeString("en-AU", { timeZone: getActiveTimeZone(), hour: "numeric", minute: "2-digit" })}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No times available that day &mdash; try another date, or give the salon a call.</p>
              )}
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => setRescheduleTarget(null)}>Cancel</Button>
        <Button
          disabled={rescheduleMutation.isPending || !selectedSlot}
          onClick={() => rescheduleTarget && rescheduleMutation.mutate({ token, appointmentId: rescheduleTarget.id, newStart: selectedSlot })}
        >
          {rescheduleMutation.isPending ? "Saving\u2026" : "Confirm new time"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Cancel this appointment?</DialogTitle></DialogHeader>
      {cancelTarget && <p className="text-sm text-muted-foreground py-2">{cancelTarget.petName}'s {(SERVICE_LABELS[cancelTarget.serviceType] ?? cancelTarget.serviceType).toLowerCase()} on {portalDateTime(cancelTarget.scheduledStart)} will be cancelled. This can't be undone from here — call the salon if you'd like to rebook.</p>}
      <DialogFooter>
        <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep appointment</Button>
        <Button
          variant="destructive"
          disabled={cancelMutation.isPending}
          onClick={() => cancelTarget && cancelMutation.mutate({ token, appointmentId: cancelTarget.id })}
        >
          {cancelMutation.isPending ? "Cancelling…" : "Yes, cancel it"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  </main>;
}

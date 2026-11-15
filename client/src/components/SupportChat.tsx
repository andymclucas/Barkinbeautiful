import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ChevronRight, LifeBuoy, MessageSquareWarning, Send, UserRound, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { BruceAvatar } from "@/components/BruceAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getActiveTimeZone } from "@/lib/timezone";
import { ASSISTANT_UNAVAILABLE_LINE, SUPPORT_MESSAGE_MAX, canAnswerSupport, isWithPerson, supportBubbleCount, type SupportSender } from "@shared/supportChat";

/**
 * The support bubble, bottom-right on every staff screen
 * (shared/supportChat.ts).
 *
 * The assistant answers first. "Talk to a person" hands the conversation
 * to Groomigo support and it carries on in the same window. Closing the
 * window does not end the conversation: the bubble shows a count when a
 * reply is waiting.
 *
 * z-40, below dialogs and side panels (z-50), so it never sits on top of
 * a Save or Take payment button in an open window.
 */

const SENDER_LABEL: Record<SupportSender, string> = {
  user: "You",
  system: "",
  ai: "Bruce",
  human: "Andy · Groomigo support",
};

export function SupportChat() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  /*
   * Groomigo support's own view (Andy, 16/11/2026): "when I click on AI
   * chat bot there is an option to switch to see what chats or requests
   * have been sent/started." The two inboxes used to be sidebar entries;
   * they are reached from here now, and only by support. The counts are
   * what the sidebar badges used to show.
   */
  const { user } = useAuth();
  const isSupport = canAnswerSupport(user ?? null);
  const [view, setViewMode] = useState<"chat" | "inbox">("chat");
  const { data: waitingChats } = trpc.supportChat.waitingCount.useQuery(
    undefined,
    { enabled: isSupport, refetchInterval: 30_000, refetchOnWindowFocus: true },
  );
  const { data: openReports } = trpc.issueReports.openCount.useQuery(
    {},
    { enabled: isSupport, refetchInterval: 60_000, refetchOnWindowFocus: true },
  );
  const chatsWaiting = waitingChats?.waiting ?? 0;
  const reportsOpen = openReports?.open ?? 0;

  // Fast while the window is open, slow otherwise: closed, it only feeds
  // the unread count on the bubble.
  const { data } = trpc.supportChat.mine.useQuery(
    {},
    { refetchInterval: open ? 4000 : 60_000, refetchOnWindowFocus: true },
  );
  const setView = (view: typeof data) => utils.supportChat.mine.setData({}, view);

  const send = trpc.supportChat.send.useMutation({
    onSuccess: setView,
    onError: (e, vars) => { setDraft(vars.message); toast.error(e.message); },
  });
  const requestPerson = trpc.supportChat.requestPerson.useMutation({
    onSuccess: setView,
    onError: (e) => toast.error(e.message),
  });
  const markRead = trpc.supportChat.markRead.useMutation({
    onSuccess: () => utils.supportChat.mine.invalidate(),
  });
  const close = trpc.supportChat.close.useMutation({
    onSuccess: () => utils.supportChat.mine.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const messages = data?.messages ?? [];
  const status = data?.conversation?.status ?? null;
  const withPerson = status !== null && isWithPerson(status);
  const unread = data?.unread ?? 0;
  // Bruce cannot answer right now (no credit on the AI account, or an
  // outage). The chat is then "coming soon": it says he is out and offers
  // nothing to type into (Andy, 15/11/2026). The server refuses messages
  // too. A conversation a person has already picked up carries on.
  const bruceOut = data?.assistantAvailable === false && !withPerson;
  const newestId = messages.length ? messages[messages.length - 1].id : 0;

  // A push for support's reply lands on ?support=open.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("support") === "open") setOpen(true);
  }, [location]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    if (unread > 0 && newestId > 0 && !markRead.isPending) markRead.mutate({ upToMessageId: newestId });
    // markRead is deliberately not a dependency: it changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, newestId, unread, send.isPending]);

  useEffect(() => { if (open && view === "chat") inputRef.current?.focus(); }, [open, view]);

  const bubbleCount = supportBubbleCount({ unread, isSupport, chatsWaiting, openReports: reportsOpen });
  const inboxWaiting = chatsWaiting + reportsOpen;

  const submit = () => {
    const message = draft.trim();
    if (!message || send.isPending) return;
    setDraft("");
    send.mutate({ message, pagePath: window.location.pathname });
  };

  const when = (d: Date | string) =>
    new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: getActiveTimeZone() });

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Groomigo support"
          className="fixed bottom-20 right-4 z-40 flex max-h-[min(36rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:right-6 sm:w-96 print:hidden"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex min-w-0 items-center gap-2.5">
              <BruceAvatar size={36} />
              <div className="min-w-0">
                <p className="text-sm font-bold">{status === "human" || status === "waiting" ? "Groomigo support" : "Bruce · Groomigo support"}</p>
                <p className="text-[11px] opacity-85">
                  {status === "waiting" ? "Waiting for Andy to reply"
                    : status === "human" ? "You are talking to Andy"
                    : bruceOut ? "Coming soon"
                    : "Ask Bruce how to do something. A person is one tap away."}
                </p>
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 shrink-0 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          {isSupport && (
            <div role="tablist" aria-label="Support views" className="flex shrink-0 border-b bg-card text-xs font-semibold">
              {(["chat", "inbox"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={view === tab}
                  onClick={() => setViewMode(tab)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 ${view === tab ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {tab === "chat" ? "Bruce" : "Inbox"}
                  {tab === "inbox" && inboxWaiting > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {inboxWaiting}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {isSupport && view === "inbox" ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3">
              <InboxLink
                href="/support"
                icon={<LifeBuoy className="h-4 w-4" />}
                title="Support chats"
                detail={chatsWaiting > 0 ? `${chatsWaiting} waiting for a reply` : "Nobody is waiting"}
                count={chatsWaiting}
                onOpen={() => setOpen(false)}
              />
              <InboxLink
                href="/issues"
                icon={<MessageSquareWarning className="h-4 w-4" />}
                title="Problem reports"
                detail={reportsOpen > 0 ? `${reportsOpen} open` : "Nothing open"}
                count={reportsOpen}
                onOpen={() => setOpen(false)}
              />
              <p className="px-1 pt-1 text-[11px] leading-snug text-muted-foreground">
                Only you see this tab. Chats the team start with Bruce and problems they report both land here.
              </p>
            </div>
          ) : (
          <>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-muted/30 p-3">
            {/* Shown, never stored: a greeting is not part of the conversation. */}
            <div className="flex items-end justify-start gap-1.5">
              <BruceAvatar size={26} />
              <div className="max-w-[85%] rounded-2xl border bg-card px-3.5 py-2 text-sm">
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">Bruce</p>
                <p className="leading-relaxed">
                  {bruceOut
                    ? <>{ASSISTANT_UNAVAILABLE_LINE}</>
                    : <>Hi, I&rsquo;m Bruce, your AI amigo! What are you trying to do? I can explain how things work in Groomigo. I can&rsquo;t see your screen or change anything.</>}
                </p>
              </div>
            </div>
            {messages.map((m) => {
              if (m.sender === "system") {
                return (
                  <p key={m.id} className="mx-auto max-w-[90%] rounded-lg bg-amber-100 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    {m.body}
                  </p>
                );
              }
              const mine = m.sender === "user";
              return (
                <div key={m.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {m.sender === "ai" && <BruceAvatar size={26} />}
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
                    {!mine && (
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">{SENDER_LABEL[m.sender]}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "opacity-70" : "text-muted-foreground"}`}>{when(m.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            {send.isPending && (
              <>
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground opacity-70">
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{send.variables?.message}</p>
                  </div>
                </div>
                {!withPerson && !bruceOut && <p className="px-1 text-xs text-muted-foreground">Bruce is typing…</p>}
              </>
            )}
          </div>

          {bruceOut ? (
            <div className="shrink-0 border-t bg-card p-3">
              <p className="text-center text-xs text-muted-foreground">
                Bruce isn&rsquo;t taking questions yet. For anything broken, use <span className="font-medium">Report a problem</span> in the top bar.
              </p>
            </div>
          ) : (
          <div className="shrink-0 space-y-2 border-t bg-card p-3">
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={draft}
                rows={2}
                maxLength={SUPPORT_MESSAGE_MAX}
                placeholder={withPerson ? "Message Andy…" : "Type your question…"}
                className="min-h-0 resize-none text-sm"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              />
              <Button onClick={submit} disabled={!draft.trim() || send.isPending} size="icon" aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              {withPerson ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Andy replies here. You can close this window; the bubble shows when he has answered.
                </p>
              ) : (
                <Button
                  type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold"
                  disabled={requestPerson.isPending || send.isPending}
                  onClick={() => requestPerson.mutate({})}
                >
                  <UserRound className="h-3.5 w-3.5" />
                  {requestPerson.isPending ? "Passing it on…" : "Talk to a person"}
                </Button>
              )}
              {status !== null && (
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  disabled={close.isPending}
                  onClick={() => close.mutate({})}
                >
                  End chat
                </button>
              )}
            </div>
            {!withPerson && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Bruce is an AI assistant and can be wrong. Don&rsquo;t type client details you wouldn&rsquo;t want shared.
              </p>
            )}
          </div>
          )}
          </>
          )}
        </div>
      )}

      <Button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-5 right-4 z-40 h-12 w-12 rounded-full p-0 shadow-xl sm:right-6 print:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <BruceAvatar size={48} className="rounded-full" />}
        {!open && bubbleCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {bubbleCount}
          </span>
        )}
      </Button>
    </>
  );
}

function InboxLink({ href, icon, title, detail, count, onOpen }: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  count: number;
  onOpen: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-sm hover:bg-muted"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
          {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

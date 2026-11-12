import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getActiveTimeZone } from "@/lib/timezone";
import { SUPPORT_MESSAGE_MAX, canAnswerSupport } from "@shared/supportChat";

/**
 * Support's side of the chat bubble (shared/supportChat.ts): every
 * conversation where somebody asked for a person, across all salons.
 * Groomigo support only — the server refuses everyone else too.
 */
const FILTERS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
] as const;

const WHO: Record<string, string> = { user: "", ai: "Guapo (AI)", human: "You", system: "" };

export default function SupportInbox() {
  const { user } = useAuth();
  const allowed = canAnswerSupport(user ?? null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [selected, setSelected] = useState<number | null>(() => {
    const n = Number(new URLSearchParams(window.location.search).get("chat"));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const inbox = trpc.supportChat.inbox.useQuery(
    { filter },
    { enabled: allowed, refetchInterval: 10_000, refetchOnWindowFocus: true },
  );
  const thread = trpc.supportChat.thread.useQuery(
    { id: selected ?? 0 },
    { enabled: allowed && selected !== null, refetchInterval: 4000, refetchOnWindowFocus: true },
  );
  const refresh = () => {
    void utils.supportChat.inbox.invalidate();
    void utils.supportChat.thread.invalidate();
    void utils.supportChat.waitingCount.invalidate();
  };
  const reply = trpc.supportChat.reply.useMutation({
    onSuccess: refresh,
    onError: (e, vars) => { setDraft(vars.message); toast.error(e.message); },
  });
  const closeThread = trpc.supportChat.closeThread.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const count = thread.data?.messages.length ?? 0;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [count, selected]);

  const submit = () => {
    const message = draft.trim();
    if (!message || reply.isPending || selected === null) return;
    setDraft("");
    reply.mutate({ id: selected, message });
  };

  const when = (d: Date | string) =>
    new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: getActiveTimeZone() });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Support chats</h1>
          <p className="text-sm text-muted-foreground">
            Conversations from the support bubble where somebody asked for a person. Replying takes the conversation over from Guapo, the AI assistant.
          </p>
        </div>

        {!allowed ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">Support chats are visible to Groomigo support only.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
            <div className="space-y-2">
              <div className="flex gap-1.5">
                {FILTERS.map((f) => (
                  <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
                    {f.label}
                  </Button>
                ))}
              </div>
              {inbox.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : inbox.isError ? (
                <p className="rounded-lg border p-3 text-sm text-destructive">Could not load the chats. They will retry on their own.</p>
              ) : (inbox.data ?? []).length === 0 ? (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                  {filter === "open" ? "Nobody is waiting." : "No closed chats yet."}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(inbox.data ?? []).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 ${selected === c.id ? "border-primary bg-muted/60" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{c.userName}</span>
                          {c.status === "waiting" ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">WAITING</span>
                          ) : c.unread > 0 ? (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">{c.unread}</span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{c.salonName} · {when(c.lastMessageAt)}</p>
                        <p className="mt-1 line-clamp-2 text-xs">{c.preview}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex min-h-[24rem] flex-col rounded-lg border">
              {selected === null ? (
                <p className="m-auto p-6 text-sm text-muted-foreground">Pick a chat to read it.</p>
              ) : thread.isLoading ? (
                <Loader2 className="m-auto h-5 w-5 animate-spin text-muted-foreground" />
              ) : thread.isError || !thread.data ? (
                <p className="m-auto p-6 text-sm text-destructive">Could not load this chat.</p>
              ) : (
                <>
                  <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{thread.data.userName} · {thread.data.salonName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {thread.data.pagePath ? `Started on ${thread.data.pagePath}` : "Page not recorded"}
                      </p>
                    </div>
                    {thread.data.status !== "closed" && (
                      <Button size="sm" variant="outline" disabled={closeThread.isPending} onClick={() => closeThread.mutate({ id: thread.data.id })}>
                        Close chat
                      </Button>
                    )}
                  </header>
                  <div ref={scrollRef} className="max-h-[55dvh] min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3">
                    {thread.data.messages.map((m) => {
                      if (m.sender === "system") {
                        return <p key={m.id} className="mx-auto max-w-[90%] rounded-lg bg-amber-100 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{m.body}</p>;
                      }
                      const mine = m.sender === "human";
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : m.sender === "ai" ? "border border-dashed bg-card" : "border bg-card"}`}>
                            {m.sender !== "human" && (
                              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">{WHO[m.sender] || thread.data.userName}</p>
                            )}
                            <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                            <p className={`mt-1 text-[10px] ${mine ? "opacity-70" : "text-muted-foreground"}`}>{when(m.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {thread.data.status === "closed" ? (
                    <p className="border-t p-3 text-center text-xs text-muted-foreground">This chat is closed.</p>
                  ) : (
                    <div className="flex items-end gap-2 border-t p-3">
                      <Textarea
                        value={draft}
                        rows={2}
                        maxLength={SUPPORT_MESSAGE_MAX}
                        placeholder={`Reply to ${thread.data.userName}…`}
                        className="min-h-0 resize-none text-sm"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                      />
                      <Button onClick={submit} disabled={!draft.trim() || reply.isPending} size="icon" aria-label="Send reply">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

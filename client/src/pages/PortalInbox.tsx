import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { getActiveTimeZone } from "@/lib/timezone";
import DashboardLayout from "@/components/DashboardLayout";

/**
 * Client portal conversations, kept apart from the SMS inbox.
 *
 * A thread sits in "awaiting_staff" when the assistant could not answer and
 * told the client a person would — that promise is the whole reason this
 * screen exists, so those sort to the top and are the only ones badged.
 */
export default function PortalInbox() {
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const threads = trpc.portalChat.listThreads.useQuery({ tenantId: 1 }, { refetchInterval: 20000 });
  const thread = trpc.portalChat.getThread.useQuery(
    { threadId: selected ?? 0 },
    { enabled: Boolean(selected), refetchInterval: 15000 },
  );
  const markRead = trpc.portalChat.markRead.useMutation({ onSuccess: () => threads.refetch() });
  const reply = trpc.portalChat.reply.useMutation({
    onSuccess: () => { setDraft(""); thread.refetch(); threads.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Opening a thread is reading it. Done as an effect rather than in the
  // click handler so it also fires when a thread is opened by any other
  // route into this screen.
  useEffect(() => { if (selected) markRead.mutate({ threadId: selected }); }, [selected]);

  const when = (v: string | Date) =>
    new Date(v).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const rows = (threads.data ?? []).slice().sort((a, b) => {
    const wait = (t: typeof a) => (t.status === "awaiting_staff" ? 0 : 1);
    if (wait(a) !== wait(b)) return wait(a) - wait(b);
    return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
  });
  const waiting = rows.filter(t => t.status === "awaiting_staff").length;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="h-6 w-6 text-primary" /> Portal messages
          </h1>
          {waiting > 0 && <Badge>{waiting} awaiting a reply</Badge>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {threads.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
              {!threads.isLoading && rows.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  No client has messaged yet.
                </p>
              )}
              {rows.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-muted/50 ${selected === t.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{[t.firstName, t.lastName].filter(Boolean).join(" ")}</span>
                    {t.unread > 0 && <Badge variant="default" className="shrink-0">{t.unread}</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.preview || "—"}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                    {t.lastMessageAt ? when(t.lastMessageAt) : ""}
                    {t.status === "awaiting_staff" && <span className="font-semibold text-amber-700 dark:text-amber-400">Needs a reply</span>}
                    {/* Only the salon's administrators are sent the name at
                        all — see listThreads. For everyone else this is
                        simply absent rather than hidden in the markup. */}
                    {t.readByName && t.staffLastReadAt && t.unread === 0 && (
                      <span className="truncate">Read by {t.readByName}, {when(t.staffLastReadAt)}</span>
                    )}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4 text-primary" />
                {thread.data ? [thread.data.thread.firstName, thread.data.thread.lastName].filter(Boolean).join(" ") : "Pick a conversation"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selected ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Choose a conversation on the left.</p>
              ) : (
                <>
                  <div className="max-h-[52vh] space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-3">
                    {(thread.data?.messages ?? []).map(m => {
                      const fromSalon = m.sender !== "client";
                      return (
                        <div key={m.id} className={`flex ${fromSalon ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${fromSalon ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
                            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
                              {m.sender === "client" ? "Client" : m.sender === "assistant" ? "Assistant" : (m.staffName ?? "Staff")}
                            </p>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                            <p className={`mt-1 text-[10px] ${fromSalon ? "opacity-70" : "text-muted-foreground"}`}>{when(m.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={draft}
                      placeholder="Reply to the client…"
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey && draft.trim() && selected) {
                          e.preventDefault(); reply.mutate({ threadId: selected, body: draft.trim() });
                        }
                      }}
                      disabled={reply.isPending}
                    />
                    <Button
                      onClick={() => selected && draft.trim() && reply.mutate({ threadId: selected, body: draft.trim() })}
                      disabled={!draft.trim() || reply.isPending}
                      className="gap-1.5"
                    >
                      <Send className="h-4 w-4" /> Send
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This goes to the client's portal, not to their phone.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

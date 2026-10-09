import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { MassTextDialog } from "@/components/MassTextDialog";
import { canAdministerStaff } from "@shared/staffAdministrators";
import { tidyTranscript, extractCallbackNumbers, formatAustralianNumber, worthShowingCallback } from "@shared/voicemailTranscript";
import { canEditSection } from "@shared/staffPermissions";
import { ThreadClientContext } from "@/components/ThreadClientContext";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useIsWideScreen } from "@/hooks/useMobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Send, Phone, CheckCircle2, XCircle, Clock, Search, RefreshCw, Trash2, PhoneMissed, X, Mic, ChevronDown, ChevronUp, Star, Loader2 } from "lucide-react";
import { getActiveTimeZone } from "@/lib/timezone";
import { EmojiPicker } from "@/components/EmojiPicker";
import { calculateSmsCost } from "@shared/smsSegments";
import { MessageThread, contactColour, contactInitials } from "@/components/MessageThread";

const SMS_TEMPLATES = [
  { key: "reminder", label: "Appointment Reminder", preview: "Hi {name}! Just a reminder that {pet} has a grooming appointment at Barkin' Beautiful tomorrow. See you then! 🐾" },
  { key: "confirmation", label: "Booking Confirmation", preview: "Hi {name}! Your booking for {pet} at Barkin' Beautiful is confirmed. We can't wait to see them! 🐾" },
  { key: "ready_pickup", label: "Ready for Pick-up", preview: "Hi {name}! {pet} is all done and looking fabulous at Barkin' Beautiful. Come pick them up whenever you're ready! 🐾✨" },
  { key: "payment_failed", label: "Payment Failed", preview: "Hi {name}, we had trouble processing your Barkin' Beautiful membership payment for {pet}. Please update your payment details to keep your membership active." },
  { key: "custom", label: "Custom Message", preview: "" },
];

const TYPE_COLOURS: Record<string, string> = {
  reminder: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  confirmation: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
  ready_pickup: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
  payment_failed: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
  tracker: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  custom: "bg-muted text-foreground",
  campaign: "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300",
  inbound: "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300",
};

export default function Messages() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [showArchivedCalls, setShowArchivedCalls] = useState(false);
  const [toNumber, setToNumber] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Emoji insert at the caret, not appended, so it can go mid-sentence. Works
  // the same on a phone, where the textarea keeps its selection while the
  // popover is open.
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const insertAtCursor = useCallback((emoji: string) => {
    const el = composerRef.current;
    setCustomBody((body) => {
      if (!el) return body + emoji;
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? start;
      const next = body.slice(0, start) + emoji + body.slice(end);
      // Restore the caret after React has re-rendered with the new value.
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        try { el.setSelectionRange(pos, pos); } catch { /* detached */ }
      });
      return next;
    });
  }, []);


  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [customBody, setCustomBody] = useState("");
  // Twilio bills per segment. One emoji forces the whole message to UCS-2,
  // where a segment is 70 characters instead of 160, so the composer shows it.
  const smsCost = useMemo(() => calculateSmsCost(customBody), [customBody]);
  const [sending, setSending] = useState(false);

  const { data: logs, refetch } = trpc.sms.getLogs.useQuery({ limit: 100 });
  const { data: threads, refetch: refetchThreads } = trpc.sms.getThreads.useQuery({ limit: 50 });
  const markAllRead = trpc.sms.markAllThreadsRead.useMutation({
    onSuccess: () => {
      toast.success("All conversations marked as read");
      refetchThreads();
      refetchMissedCalls();
      utils.sms.getUnreadPreview.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const { data: missedCallsList, refetch: refetchMissedCalls } = trpc.sms.getMissedCalls.useQuery({ limit: 100 });
  const clearMissedCall = trpc.sms.clearMissedCall.useMutation({ onSuccess: () => refetchMissedCalls() });
  const deleteMissedCall = trpc.sms.deleteMissedCall.useMutation({ onSuccess: () => { toast.success("Missed call removed"); refetchMissedCalls(); } });
  const { data: clientResults } = trpc.memberships.searchClients.useQuery(
    { search: clientSearch },
    { enabled: clientSearch.length >= 2 }
  );

  // At lg the conversation shows in the centre pane, so the dialog must not
  // mount at all — a Radix Dialog hidden with lg:hidden still renders its
  // overlay, which greys the page out and swallows every click.
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const isWideScreen = useIsWideScreen();
  const utils = trpc.useUtils();
  // The button only appears for someone who may actually send. The server
  // checks again — this just avoids offering what would be refused.
  const { data: me } = trpc.auth.me.useQuery();
  const { data: myStaff } = trpc.staff.getMyProfile.useQuery(undefined, { retry: false });
  const canMassText =
    canAdministerStaff(me ? { id: me.id, email: me.email } : null) ||
    canEditSection(myStaff ?? null, "mass_text");
  const { data: starredList, refetch: refetchStarred } = trpc.sms.getStarredThreads.useQuery({});
  const starredKeys = useMemo(() => new Set(starredList ?? []), [starredList]);
  const setStarred = trpc.sms.setThreadStarred.useMutation({
    onSuccess: () => refetchStarred(),
    onError: (error) => toast.error(error.message),
  });
  // Unread across both kinds, so "mark all" and the badge agree.
  const unreadThreadCount = (threads ?? []).filter((t: any) => (t.unreadCount ?? 0) > 0).length
    + (missedCallsList ?? []).filter((c: any) => !c.readAt).length;
  const [openThread, setOpenThread] = useState<{ clientId: number | null; toNumber: string; clientName: string | null } | null>(null);

  const markThreadReadMutation = trpc.sms.markThreadRead.useMutation({
    onSuccess: () => {
      refetchThreads();
      utils.sms.getUnreadPreview.invalidate();
    },
  });

  const deleteMessageMutation = trpc.sms.deleteMessage.useMutation({
    onSuccess: () => { toast.success("Message deleted"); refetch(); refetchThreads(); utils.sms.getUnreadPreview.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteThreadMutation = trpc.sms.deleteThread.useMutation({
    onSuccess: () => {
      toast.success("Conversation deleted");
      refetch(); refetchThreads(); utils.sms.getUnreadPreview.invalidate();
      setOpenThread(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const clearFailedMutation = trpc.sms.clearFailed.useMutation({
    onSuccess: () => { toast.success("Failed messages cleared"); refetch(); refetchThreads(); },
    onError: (e) => toast.error(e.message),
  });

  // Rows for the hover preview, taken from the sms.getLogs data already on the
  // page so hovering costs no extra request. Ordering, the newest-first slice
  // and the timestamp fallbacks now live in shared/messageThreadGrouping,
  // which is unit-tested — this used to be a hand-rolled sort here and it
  // twice showed stale messages.
  const threadPreview = (thread: { clientId: number | null; toNumber: string }) => {
    if (!logs) return [];
    return (logs as any[]).filter(l => (thread.clientId ? l.clientId === thread.clientId : l.toNumber === thread.toNumber));
  };

  const openThreadDialog = (thread: { clientId: number | null; toNumber: string; clientName: string | null }) => {
    setOpenThread(thread);
    markThreadReadMutation.mutate(thread.clientId ? { clientId: thread.clientId } : { toNumber: thread.toNumber });
  };

  // Support arriving here from the notification bell with ?clientId=X or ?toNumber=Y
  useEffect(() => {
    if (!threads || threads.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const clientIdParam = params.get("clientId");
    const toNumberParam = params.get("toNumber");
    if (!clientIdParam && !toNumberParam) return;
    const match = threads.find((t: any) =>
      (clientIdParam && t.clientId === Number(clientIdParam)) ||
      (toNumberParam && t.toNumber === toNumberParam)
    );
    if (match) {
      openThreadDialog({ clientId: match.clientId, toNumber: match.toNumber, clientName: match.clientName });
      window.history.replaceState({}, "", "/messages");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads]);

  // Live refresh: while this page is open, new inbound messages and missed
  // calls should appear without needing a manual refresh click.
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "new-message") {
          refetch(); refetchThreads();
        } else if (payload?.type === "missed-call") {
          refetchMissedCalls();
        }
      } catch {
        // ignore malformed events
      }
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const threadMessages = useMemo(() => {
    if (!openThread || !logs) return [];
    return logs
      .filter((l: any) => (openThread.clientId ? l.clientId === openThread.clientId : l.toNumber === openThread.toNumber))
      .slice()
      .sort((a: any, b: any) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }, [openThread, logs]);


  const sendMutation = trpc.sms.send.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("SMS sent successfully");
        setComposeOpen(false);
        setToNumber(""); setCustomBody(""); setSelectedTemplate("custom"); setClientSearch(""); setSelectedClientId(null);
        refetch();
      } else {
        toast.error(`SMS failed: ${result.error}`);
      }
      setSending(false);
    },
    onError: (err) => { toast.error(err.message); setSending(false); },
  });

  const reviewInboundMutation = trpc.sms.reviewInboundReply.useMutation({
    onSuccess: (result) => {
      toast.success(result.action === "confirm" ? "Appointment confirmed from reviewed reply" : "Appointment cancelled from reviewed reply");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    const q = search.toLowerCase();
    return logs.filter((l: any) => {
      const matchesSearch = !q || l.toNumber.includes(q) || (l.clientName ?? "").toLowerCase().includes(q) || l.body.toLowerCase().includes(q) || l.type.includes(q);
      return matchesSearch && (statusFilter === "all" || l.status === statusFilter) && (typeFilter === "all" || l.type === typeFilter);
    });
  }, [logs, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    if (!logs) return { total: 0, sent: 0, failed: 0 };
    return { total: logs.length, sent: logs.filter((l: any) => l.status === "sent").length, failed: logs.filter((l: any) => l.status === "failed").length };
  }, [logs]);

  const pendingInboundReplies = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log: any) => log.direction === "inbound" && ["confirm", "cancel"].includes(log.replyIntent) && !log.processedAt && log.appointmentId);
  }, [logs]);

  const appointmentContext = (log: any) => {
    if (!log.appointmentId || !log.appointmentStart) return "No future appointment linked";
    const when = new Date(log.appointmentStart).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
    return `${log.petName ?? "Pet"} · ${when}`;
  };

  const templatePreview = useMemo(() => {
    const t = SMS_TEMPLATES.find(t => t.key === selectedTemplate);
    if (!t) return "";
    if (selectedTemplate === "custom") return customBody;
    return t.preview;
  }, [selectedTemplate, customBody]);

  const handleSend = () => {
    if (!toNumber) { toast.error("Enter a phone number"); return; }
    const body = selectedTemplate === "custom" ? customBody : templatePreview;
    if (!body.trim()) { toast.error("Message body is empty"); return; }
    setSending(true);
    sendMutation.mutate({ clientId: selectedClientId ?? undefined, toNumber, body, type: selectedTemplate as any });
  };

  /**
   * Send a reply to the open thread, without leaving it.
   *
   * Uses the same sms.send procedure the compose dialog does, so there is
   * one send path and one set of logs. The thread stays selected
   * afterwards — the old flow cleared it, so answering a message lost your
   * place in the list.
   */
  const sendReply = useCallback(() => {
    const body = replyBody.trim();
    if (!openThread || !body || replySending) return;
    setReplySending(true);
    sendMutation.mutate(
      {
        clientId: openThread.clientId ?? undefined,
        toNumber: openThread.toNumber,
        body,
        type: "custom",
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            setReplyBody("");
            refetch();
            refetchThreads();
          }
          setReplySending(false);
        },
        onError: () => setReplySending(false),
      },
    );
  }, [openThread, replyBody, replySending, sendMutation, refetch, refetchThreads]);

  // The conversation itself. Rendered in the centre pane on desktop and
  // inside the dialog on a phone — one definition, so the two cannot
  // drift apart.
  const conversationPane = (
    <>
              <div className="space-y-0 border-b bg-background/95 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: contactColour(openThread?.toNumber ?? "") }}
                    aria-hidden="true"
                  >
                    {contactInitials(openThread?.clientName, openThread?.toNumber ?? "")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-tight">
                      {openThread?.clientName?.trim() || openThread?.toNumber}
                    </p>
                    {openThread?.clientName && (
                      <p className="truncate text-[11px] font-normal text-muted-foreground">{openThread.toNumber}</p>
                    )}
                  </div>
                </div>
              </div>
    
              <div className="flex-1 min-h-[320px] overflow-y-auto bg-muted/20 px-3 py-2 lg:h-auto lg:min-h-0">
                <MessageThread
                  messages={threadMessages}
                  showStatus
                  autoScroll={!!openThread}
                  emptyText="No messages in this conversation yet."
                />
              </div>
    
              {/* Reply where the conversation is. This used to clear the open
              thread and launch the compose dialog, which closed over the
              page and left nothing selected when it was dismissed — two
              clicks to answer "I'm on my way". */}
          <div className="flex items-end gap-2 border-t bg-background px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              disabled={deleteThreadMutation.isPending}
              aria-label="Delete conversation"
              onClick={() => {
                if (!openThread) return;
                if (confirm(`Delete this entire conversation with ${openThread.clientName?.trim() || openThread.toNumber}? This can't be undone.`)) {
                  deleteThreadMutation.mutate(openThread.clientId ? { clientId: openThread.clientId } : { toNumber: openThread.toNumber });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Textarea
              rows={1}
              value={replyBody}
              placeholder="Message…"
              className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl py-2"
              disabled={replySending}
              onChange={(e) => setReplyBody(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, shift+Enter makes a new line — what every
                // messaging app does, and what the hands expect.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendReply();
                }
              }}
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="Send reply"
              disabled={replySending || replyBody.trim().length === 0}
              onClick={sendReply}
            >
              {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
    </>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Messages</h1>
            <p className="text-sm text-muted-foreground">SMS communications via Twilio</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button onClick={() => setComposeOpen(true)} className="gap-1.5">
              <Send className="h-4 w-4" /> Compose SMS
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Sent", value: stats.total, icon: MessageSquare, colour: "text-blue-600 dark:text-blue-400" },
            { label: "Delivered", value: stats.sent, icon: CheckCircle2, colour: "text-emerald-600 dark:text-emerald-400" },
            { label: "Failed", value: stats.failed, icon: XCircle, colour: "text-red-600 dark:text-red-400" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`h-8 w-8 ${s.colour}`} />
                <div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PhoneMissed className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Missed Calls
              {missedCallsList && missedCallsList.filter(c => !c.readAt).length > 0 && (
                <Badge className="bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50">
                  {missedCallsList.filter(c => !c.readAt).length} unread
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Voicemail transcripts from missed landline calls, routed via Twilio</p>
          </CardHeader>
          <CardContent className="pt-0">
            {missedCallsList && missedCallsList.length > 0 ? (() => {
              const unread = missedCallsList.filter(c => !c.readAt);
              const archived = missedCallsList.filter(c => !!c.readAt);
              const renderCall = (call: typeof missedCallsList[0]) => (
                <div
                  key={call.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${call.readAt ? "bg-background" : "bg-amber-50/60 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900/50"}`}
                >
                  <Phone className={`h-4 w-4 mt-0.5 shrink-0 ${call.readAt ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold truncate">
                          {(call.clientName as string | null)?.trim() || call.fromNumber}
                          {(call.petNames as string[] | undefined)?.length ? ` (${(call.petNames as string[]).join(" & ")})` : ""}
                        </span>
                        {call.recordingUrl && (
                          <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-violet-100 dark:bg-violet-950/50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                            <Mic className="h-2.5 w-2.5" /> Voicemail
                          </span>
                        )}
                      </div>
                      <span className="flex shrink-0 flex-col items-end text-[11px] text-muted-foreground">
                        <span>
                          {new Date(call.receivedAt).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </span>
                        {/* Only administrators are sent the name at all — see
                            getMissedCalls. Voicemails archived before this was
                            recorded simply have no reader, which is the truth
                            about them. */}
                        {call.readAt && (call as any).readByName && (
                          <span className="text-[10px] text-muted-foreground/80">
                            Checked by {(call as any).readByName}, {new Date(call.readAt).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                      </span>
                    </div>
                    {(call.clientName as string | null)?.trim() && <p className="text-xs text-muted-foreground">{call.fromNumber}</p>}
                    {(() => {
                      if (call.transcriptionStatus !== "completed") {
                        return <p className="text-sm mt-1"><span className="italic text-muted-foreground">No transcript available</span></p>;
                      }
                      // Twilio mishears words and this does not pretend to
                      // fix them. What it fixes is the number: callers say
                      // "418 double 104 double 5" and drop the leading zero,
                      // which nobody can dial off the screen.
                      const tidy = tidyTranscript(call.transcriptText);
                      const spoken = extractCallbackNumbers(call.transcriptText ?? "");
                      // Usually the caller recites their own number, which we
                      // already have. Worth showing only when it is genuinely
                      // different — or when they withheld caller ID, where it
                      // is the only way to ring back. A number one digit off
                      // the caller's own is a mishearing, not a second number.
                      const worthShowing = spoken.filter(n => worthShowingCallback(n, call.fromNumber));
                      return (
                        <>
                          <p className="text-sm mt-1">{`"${tidy}"`}</p>
                          {worthShowing.length > 0 && (
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">They asked to be called on</span>
                              {worthShowing.map(digits => (
                                <a
                                  key={digits}
                                  href={`tel:${digits}`}
                                  className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/20"
                                >
                                  {formatAustralianNumber(digits)}
                                </a>
                              ))}
                            </p>
                          )}
                        </>
                      );
                    })()}
                    {call.recordingUrl && (
                      <audio
                        className="mt-2 h-8 w-full max-w-sm"
                        controls
                        preload="none"
                        src={`/api/twilio/voicemail-audio/${call.id}`}
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!call.readAt && (
                      <button
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted-foreground/20 text-muted-foreground"
                        title="Mark as read / archive"
                        onClick={() => clearMissedCall.mutate({ id: call.id })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {/* Only allow deletion when there is no voicemail recording */}
                    {!call.recordingUrl && (
                      <button
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-950/50 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        title="Delete this missed call"
                        onClick={() => {
                          if (confirm("Delete this missed call? This can't be undone.")) {
                            deleteMissedCall.mutate({ id: call.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
              return (
                <div className="space-y-2">
                  {unread.length === 0 && archived.length > 0 && (
                    <p className="text-xs text-muted-foreground pb-1">All caught up — no unread missed calls.</p>
                  )}
                  {unread.map(renderCall)}
                  {archived.length > 0 && (
                    <>
                      <button
                        className="flex w-full items-center gap-1.5 pt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowArchivedCalls(v => !v)}
                      >
                        {showArchivedCalls ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {archived.length} archived {archived.length === 1 ? "call" : "calls"}
                        {archived.some(c => c.recordingUrl) && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 dark:bg-violet-950/50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"><Mic className="h-2.5 w-2.5" /> with voicemails</span>}
                      </button>
                      {showArchivedCalls && <div className="space-y-2 pt-1">{archived.map(renderCall)}</div>}
                    </>
                  )}
                </div>
              );
            })() : (
              <p className="text-sm text-muted-foreground text-center py-6">No missed calls recorded yet</p>
            )}
          </CardContent>
        </Card>

        {/* Three panes, the way a messaging app is actually used: the list
            stays put, the conversation fills the middle, and who you are
            talking to sits beside it. Below lg there is no room for three,
            so the list is the page and a tap opens the conversation in a
            dialog — the same markup, not a second implementation. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,17rem)]">
        <Card className="lg:flex lg:h-[calc(100vh-13rem)] lg:flex-col lg:overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">
                Conversations
                {unreadThreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {unreadThreadCount} unread
                  </span>
                )}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {threads?.length ?? 0} open
                </span>
              </CardTitle>
              <div className="flex items-center gap-1">
                {canMassText && <MassTextDialog />}
                {unreadThreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={markAllRead.isPending}
                    onClick={() => markAllRead.mutate({})}
                  >
                    {markAllRead.isPending ? "Marking…" : "Mark all as read"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          {/* The card is a fixed-height flex column, so the list inside it
              has to be the part that scrolls — min-h-0 because a flex child
              will not shrink below its content without it, which is what left
              the list clipped with nowhere to scroll. */}
          <CardContent className="px-4 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {!threads || threads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No conversations yet.</p>
            ) : (
              <div className="divide-y">
                {[...threads]
                  .sort((a: any, b: any) => {
                    // Starred first; everything else keeps the server's
                    // most-recent-first order.
                    const sa = starredKeys.has(a.threadKey) ? 1 : 0;
                    const sb = starredKeys.has(b.threadKey) ? 1 : 0;
                    return sb - sa;
                  })
                  .map((thread: any) => {
                  const displayName = thread.clientName?.trim() || thread.toNumber;
                  return (
                  <div
                    key={thread.threadKey}
                    className="group -mx-2 flex w-full items-center gap-2 rounded-xl px-2 transition-colors hover:bg-accent/50"
                  >
                    <button
                      type="button"
                      className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-amber-500"
                      aria-label={starredKeys.has(thread.threadKey) ? "Unstar this conversation" : "Star this conversation"}
                      title={starredKeys.has(thread.threadKey) ? "Starred — shown first" : "Star this conversation"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStarred.mutate({ threadKey: thread.threadKey, starred: !starredKeys.has(thread.threadKey) });
                      }}
                    >
                      <Star className={`h-4 w-4 ${starredKeys.has(thread.threadKey) ? "fill-amber-400 text-amber-500" : ""}`} />
                    </button>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                      onClick={() => openThreadDialog({ clientId: thread.clientId, toNumber: thread.toNumber, clientName: thread.clientName })}
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                        style={{ background: contactColour(thread.threadKey ?? displayName) }}
                        aria-hidden="true"
                      >
                        {contactInitials(thread.clientName, thread.toNumber)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[15px] ${thread.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{displayName}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {new Date(thread.lastAt).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short" })}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className={`min-w-0 flex-1 truncate text-[13px] ${thread.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                            {thread.lastDirection === "outbound" ? "You: " : ""}{thread.lastMessage}
                          </p>
                          {thread.readAt && thread.unreadCount === 0 && (
                            <span className="truncate text-[10px] text-muted-foreground/80">
                              {thread.readByName
                                ? `Read by ${thread.readByName}, ${new Date(thread.readAt).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}`
                                : "Read"}
                            </span>
                          )}
                          {thread.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                              {thread.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={deleteThreadMutation.isPending}
                      aria-label="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete this entire conversation with ${thread.clientName?.trim() || thread.toNumber}? This can't be undone.`)) {
                          deleteThreadMutation.mutate(thread.clientId ? { clientId: thread.clientId } : { toNumber: thread.toNumber });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hidden lg:flex lg:h-[calc(100vh-13rem)] lg:flex-col lg:overflow-hidden">
          {openThread ? conversationPane : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="text-sm text-muted-foreground">Choose a conversation to read it here.</p>
            </div>
          )}
        </Card>

        <Card className="hidden lg:block lg:h-[calc(100vh-13rem)] lg:overflow-y-auto">
          {openThread ? (
            <ThreadClientContext clientId={openThread.clientId ?? null} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="text-xs text-muted-foreground">Client details appear here.</p>
            </div>
          )}
        </Card>
        </div>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">SMS Templates</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {SMS_TEMPLATES.filter(t => t.key !== "custom").map(t => (
              <div key={t.key} className="rounded-lg border p-3 space-y-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[t.key]}`}>{t.label}</span>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">{t.preview}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/50">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-sm text-blue-900 dark:text-blue-200">Automated Appointment Reminders</div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Three-stage reminders are ready: 4 days before, 2 days before, and the morning of each appointment.
                Each stage sends once per appointment and will only send after the salon explicitly enables live SMS automation.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge className="bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs">SMS_AUTOMATION_ENABLED</Badge>
                <span className="text-xs text-blue-600 dark:text-blue-400">Set this environment variable to "true" in Render when you're ready to turn on automated reminders</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Phone className="h-4 w-4" /> Twilio Webhook Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">Configure these URLs in your Twilio console under Phone Numbers &rarr; Active Numbers &rarr; your number:</p>
            <div className="space-y-2">
              <div className="rounded-md bg-muted p-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">Status Callback URL (POST)</div>
                <code className="text-xs break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/twilio/status</code>
              </div>
              <div className="rounded-md bg-muted p-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">Inbound SMS Webhook (POST)</div>
                <code className="text-xs break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/twilio/inbound</code>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/40">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Inbound Reply Review Queue</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Replies never alter a booking until a staff member reviews and explicitly applies the recognised intent.</p>
              </div>
              <Badge className="bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-xs">{pendingInboundReplies.length} awaiting review</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {pendingInboundReplies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No inbound confirmation or cancellation replies are awaiting review.</p>
            ) : (
              <div className="space-y-2">
                {pendingInboundReplies.map((log: any) => (
                  <div key={log.id} className="flex flex-col gap-3 border-b border-amber-100 dark:border-amber-950/50 pb-3 last:border-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{log.clientName || log.toNumber} <span className="font-normal text-muted-foreground">replied “{log.body}”</span></div>
                      <div className="mt-1 text-xs text-muted-foreground">Booking: {appointmentContext(log)}</div>
                      <div className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">Recognised intent: {log.replyIntent}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={log.replyIntent === "cancel" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}
                      disabled={reviewInboundMutation.isPending}
                      onClick={() => reviewInboundMutation.mutate({ smsLogId: log.id, action: log.replyIntent })}
                    >
                      {log.replyIntent === "confirm" ? "Confirm appointment" : "Cancel booking"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">SMS History</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[118px] text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-[132px] text-xs"><SelectValue placeholder="All templates" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All templates</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="confirmation">Booking confirmation</SelectItem>
                    <SelectItem value="ready_pickup">Ready for pick-up</SelectItem>
                    <SelectItem value="payment_failed">Payment failed</SelectItem>
                    <SelectItem value="tracker">Pet Tracker</SelectItem>
                    <SelectItem value="campaign">Campaign</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="inbound">Inbound reply</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search messages..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {(logs ?? []).some((l: any) => l.status === "failed") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    disabled={clearFailedMutation.isPending}
                    onClick={() => {
                      if (confirm("Delete all failed messages? This can't be undone.")) {
                        clearFailedMutation.mutate({});
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear failed
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No SMS messages sent yet.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground text-xs">Time</th>
                      <th className="text-left py-2 font-medium text-muted-foreground text-xs">Recipient / sender</th>
                    <th className="text-left py-2 font-medium text-muted-foreground text-xs">Type</th>
                    <th className="text-left py-2 font-medium text-muted-foreground text-xs">Message</th>
                    <th className="text-right py-2 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-right py-2 font-medium text-muted-foreground text-xs w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log: any) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {log.sentAt ? new Date(log.sentAt).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
                      </td>
                      <td className="py-2.5 text-xs">
                        <div>{log.clientName || log.toNumber}{log.direction === "inbound" && <span className="ml-1 text-violet-700 dark:text-violet-300">(reply)</span>}</div>
                        {log.clientName && <div className="text-muted-foreground">{log.toNumber}</div>}
                      </td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLOURS[log.type] ?? "bg-muted text-foreground"}`}>{log.type.replace(/_/g, " ")}</span>
                        {log.direction === "inbound" && log.replyIntent && log.replyIntent !== "unknown" && !log.processedAt && (
                          <div className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">Review required: {log.replyIntent}</div>
                        )}
                        {log.direction === "inbound" && log.appointmentId && <div className="mt-1 text-[10px] text-muted-foreground">{appointmentContext(log)}</div>}
                        {log.direction === "inbound" && log.processedAt && <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">Reviewed: {log.reviewAction}{log.reviewerName ? ` by ${log.reviewerName}` : ""}</div>}
                      </td>
                      <td className="py-2.5 text-xs max-w-xs">
                        <div className="truncate text-muted-foreground" title={log.body}>{log.body}</div>
                      </td>
                      <td className="py-2.5 text-right">
                        {log.direction === "inbound" && log.replyIntent !== "unknown" && !log.processedAt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-7 text-xs ${log.replyIntent === "cancel" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}
                            disabled={reviewInboundMutation.isPending || !log.appointmentId}
                            onClick={() => reviewInboundMutation.mutate({ smsLogId: log.id, action: log.replyIntent })}
                          >
                            {log.replyIntent === "confirm" ? "Confirm appointment" : "Cancel booking"}
                          </Button>
                        ) : log.status === "delivered" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Delivered</span>
                        ) : log.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Sent</span>
                        ) : log.status === "received" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400"><MessageSquare className="h-3.5 w-3.5" /> Received</span>
                        ) : log.status === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><XCircle className="h-3.5 w-3.5" /> Failed</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Clock className="h-3.5 w-3.5" /> Pending</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                          disabled={deleteMessageMutation.isPending}
                          onClick={() => deleteMessageMutation.mutate({ id: log.id })}
                          aria-label="Delete message"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compose SMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Search Client</label>
              <Input placeholder="Type client name to search..." value={clientSearch} onChange={e => { setClientSearch(e.target.value); setSelectedClientId(null); }} className="mt-1" />
              {clientResults && clientResults.length > 0 && !selectedClientId && (
                <div className="mt-1 border rounded-md max-h-40 overflow-y-auto">
                  {(clientResults as any[]).map((c) => (
                    <button key={c.clientId} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => { setSelectedClientId(c.clientId); setClientSearch(`${c.firstName} ${c.lastName}`); setToNumber(c.phone ?? ""); }}>
                      <span>{c.firstName} {c.lastName}</span>
                      <span className="text-xs text-muted-foreground">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <Input placeholder="+61400000000" value={toNumber} onChange={e => setToNumber(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Template</label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SMS_TEMPLATES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedTemplate === "custom" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Message</label>
                <Textarea
                  ref={composerRef}
                  placeholder="Type your message... Use {name} for client name, {pet} for pet name"
                  value={customBody}
                  onChange={e => setCustomBody(e.target.value)}
                  className="mt-1 min-h-[100px]"
                />
                <div className="mt-1 flex items-center gap-2">
                  <EmojiPicker onSelect={insertAtCursor} />
                  <div className="flex-1 text-right text-xs text-muted-foreground">
                    {smsCost.forcedUnicode && (
                      <span className="mr-2 text-amber-600 dark:text-amber-500">
                        emoji → {smsCost.encoding}, {70} per segment
                      </span>
                    )}
                    {customBody.length}/1600 · {smsCost.segments} segment{smsCost.segments === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Preview</label>
                <div className="mt-1 rounded-md bg-muted p-3 text-sm text-muted-foreground leading-relaxed">{templatePreview}</div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
              <Button onClick={handleSend} disabled={sending} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> {sending ? "Sending..." : "Send SMS"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Thread conversation dialog ── */}
      {/* Below lg there is no room for three panes, so a tap opens the
          same conversation in a dialog. */}
      {!isWideScreen && (
      <Dialog open={!!openThread} onOpenChange={(open) => !open && setOpenThread(null)}>
        <DialogContent className="max-w-[420px] gap-0 overflow-hidden rounded-[26px] p-0 lg:hidden">
          <DialogTitle className="sr-only">
            {openThread?.clientName?.trim() || openThread?.toNumber || "Conversation"}
          </DialogTitle>
          <div className="flex min-h-0 flex-col">
            {conversationPane}
          </div>
        </DialogContent>
      </Dialog>
      )}

    </DashboardLayout>
  );
}

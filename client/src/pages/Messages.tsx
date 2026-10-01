import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useHasHover } from "@/hooks/useMobile";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Send, Phone, CheckCircle2, XCircle, Clock, Search, RefreshCw, Trash2, PhoneMissed, X, Mic, ChevronDown, ChevronUp } from "lucide-react";
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


  // Conversation preview, anchored to the cursor.
  //
  // This used to be a Radix HoverCard with side="right". The list rows are full
  // width, so "right of the trigger" had no room, Radix flipped it, and the card
  // landed at the far left of the window over the sidebar - nowhere near the
  // pointer. Anchoring to the cursor is the only placement that reads correctly
  // for a full-width row.
  //
  // Position is written straight to the node rather than held in state: the
  // conversation list re-rendering on every mousemove was not worth it.
  // How many messages the hover card shows before it gives up and points at the
  // full conversation. Chosen so a compact thread still fits inside max-h-[80vh]
  // on a laptop screen.
  const PREVIEW_MESSAGE_LIMIT = 12;
  const hasHover = useHasHover();
  const [previewThread, setPreviewThread] = useState<any | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const positionPreview = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;
    const gap = 18;
    const { x, y } = pointer.current;
    const w = el.offsetWidth || 384; // w-96
    const h = el.offsetHeight || 360;
    // Flip to the left of the cursor when the card would run off the right edge.
    const left = x + gap + w > window.innerWidth - 8 ? Math.max(8, x - gap - w) : x + gap;
    // Sit slightly above the cursor, clamped so the card is always fully visible.
    const top = Math.min(Math.max(8, y - 24), Math.max(8, window.innerHeight - h - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, []);

  // Track the cursor so the card opens exactly where the pointer is, but do NOT
  // reposition once it is open: the card is tall enough to read, and a panel of
  // text that slides around under the pointer is unreadable. It settles where it
  // opened and only moves when you hover a different conversation.
  const trackPointer = useCallback((e: { clientX: number; clientY: number }) => {
    pointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  const openPreview = useCallback((thread: any, e: { clientX: number; clientY: number }) => {
    // Touch devices synthesise mouseenter on tap, which would open this
    // preview on top of the thread dialog the same tap just opened.
    if (!hasHover) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewThread(thread), 220);
  }, [hasHover]);

  const closePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreviewThread(null);
  }, []);

  // Place the card as soon as it mounts, before the browser paints, so it never
  // flashes at the top-left corner on the first frame.
  useEffect(() => { if (previewThread) positionPreview(); }, [previewThread, positionPreview]);
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
  // A scroll or a resize invalidates the anchor point entirely.
  useEffect(() => {
    if (!previewThread) return;
    window.addEventListener("scroll", closePreview, true);
    window.addEventListener("resize", closePreview);
    return () => {
      window.removeEventListener("scroll", closePreview, true);
      window.removeEventListener("resize", closePreview);
    };
  }, [previewThread, closePreview]);
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [customBody, setCustomBody] = useState("");
  // Twilio bills per segment. One emoji forces the whole message to UCS-2,
  // where a segment is 70 characters instead of 160, so the composer shows it.
  const smsCost = useMemo(() => calculateSmsCost(customBody), [customBody]);
  const [sending, setSending] = useState(false);

  const { data: logs, refetch } = trpc.sms.getLogs.useQuery({ tenantId: 1, limit: 100 });
  const { data: threads, refetch: refetchThreads } = trpc.sms.getThreads.useQuery({ tenantId: 1, limit: 50 });
  const { data: missedCallsList, refetch: refetchMissedCalls } = trpc.sms.getMissedCalls.useQuery({ tenantId: 1, limit: 100 });
  const clearMissedCall = trpc.sms.clearMissedCall.useMutation({ onSuccess: () => refetchMissedCalls() });
  const deleteMissedCall = trpc.sms.deleteMissedCall.useMutation({ onSuccess: () => { toast.success("Missed call removed"); refetchMissedCalls(); } });
  const { data: clientResults } = trpc.memberships.searchClients.useQuery(
    { search: clientSearch, tenantId: 1 },
    { enabled: clientSearch.length >= 2 }
  );

  const utils = trpc.useUtils();
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
    markThreadReadMutation.mutate(thread.clientId ? { tenantId: 1, clientId: thread.clientId } : { tenantId: 1, toNumber: thread.toNumber });
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
    sendMutation.mutate({ tenantId: 1, clientId: selectedClientId ?? undefined, toNumber, body, type: selectedTemplate as any });
  };

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
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {new Date(call.receivedAt).toLocaleString("en-AU", { timeZone: getActiveTimeZone(), day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    {(call.clientName as string | null)?.trim() && <p className="text-xs text-muted-foreground">{call.fromNumber}</p>}
                    <p className="text-sm mt-1">
                      {call.transcriptionStatus === "completed"
                        ? `"${call.transcriptText}"`
                        : <span className="italic text-muted-foreground">No transcript available</span>}
                    </p>
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

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!threads || threads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No conversations yet.</p>
            ) : (
              <div className="divide-y">
                {threads.map((thread: any) => {
                  const displayName = thread.clientName?.trim() || thread.toNumber;
                  return (
                  <div
                    key={thread.threadKey}
                    className="group -mx-2 flex w-full items-center gap-2 rounded-xl px-2 transition-colors hover:bg-accent/50"
                    onMouseEnter={hasHover ? (e) => openPreview(thread, e) : undefined}
                    onMouseMove={hasHover ? trackPointer : undefined}
                    onMouseLeave={hasHover ? closePreview : undefined}
                  >
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
                          deleteThreadMutation.mutate(thread.clientId ? { tenantId: 1, clientId: thread.clientId } : { tenantId: 1, toNumber: thread.toNumber });
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
                      onClick={() => reviewInboundMutation.mutate({ tenantId: 1, smsLogId: log.id, action: log.replyIntent })}
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
                        clearFailedMutation.mutate({ tenantId: 1 });
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
                            onClick={() => reviewInboundMutation.mutate({ tenantId: 1, smsLogId: log.id, action: log.replyIntent })}
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
                          onClick={() => deleteMessageMutation.mutate({ id: log.id, tenantId: 1 })}
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
      <Dialog open={!!openThread} onOpenChange={(open) => !open && setOpenThread(null)}>
        {/* Sized and shaped like a phone screen: a tall, narrow, rounded panel
            with its own header and footer bars and a scrolling message area
            between them. The whole panel is the conversation — no page chrome
            bleeding in, which is what made the old dialog feel like a table. */}
        <DialogContent className="max-w-[420px] gap-0 overflow-hidden rounded-[26px] p-0 sm:max-w-[420px]">
          <DialogHeader className="space-y-0 border-b bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: contactColour(openThread?.toNumber ?? "") }}
                aria-hidden="true"
              >
                {contactInitials(openThread?.clientName, openThread?.toNumber ?? "")}
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-[15px] font-semibold leading-tight">
                  {openThread?.clientName?.trim() || openThread?.toNumber}
                </DialogTitle>
                {openThread?.clientName && (
                  <p className="truncate text-[11px] font-normal text-muted-foreground">{openThread.toNumber}</p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="h-[58vh] min-h-[320px] overflow-y-auto bg-muted/20 px-3 py-2">
            <MessageThread
              messages={threadMessages}
              showStatus
              autoScroll={!!openThread}
              emptyText="No messages in this conversation yet."
            />
          </div>

          {/* The bar an iPhone puts at the bottom of a thread. Replying still
              opens the compose dialog, which carries the template picker and
              the send-safety checks — this is the entry point, not a second
              send path. */}
          <div className="flex items-center gap-2 border-t bg-background px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              disabled={deleteThreadMutation.isPending}
              aria-label="Delete conversation"
              onClick={() => {
                if (!openThread) return;
                if (confirm(`Delete this entire conversation with ${openThread.clientName?.trim() || openThread.toNumber}? This can't be undone.`)) {
                  deleteThreadMutation.mutate(openThread.clientId ? { tenantId: 1, clientId: openThread.clientId } : { tenantId: 1, toNumber: openThread.toNumber });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <button
              type="button"
              className="flex h-10 min-w-0 flex-1 items-center rounded-full border bg-muted/40 px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => {
                if (!openThread) return;
                setOpenThread(null);
                setToNumber(openThread.toNumber);
                setSelectedClientId(openThread.clientId);
                setClientSearch(openThread.clientId ? (openThread.clientName?.trim() || "") : "");
                setComposeOpen(true);
              }}
            >
              Message…
            </button>
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="Reply"
              onClick={() => {
                if (!openThread) return;
                setOpenThread(null);
                setToNumber(openThread.toNumber);
                setSelectedClientId(openThread.clientId);
                setClientSearch(openThread.clientId ? (openThread.clientName?.trim() || "") : "");
                setComposeOpen(true);
              }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conversation preview, positioned at the cursor by positionPreview().
          Portalled to the body so no ancestor's transform or overflow can clip
          it, and pointer-events-none so it never swallows the click on the row
          underneath. */}
      {hasHover && previewThread && createPortal(
        <div
          ref={previewRef}
          role="tooltip"
          className="pointer-events-none fixed z-50 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
          style={{ left: 0, top: 0 }}
        >
          <div className="flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: contactColour(previewThread.threadKey ?? (previewThread.clientName?.trim() || previewThread.toNumber)) }}
              aria-hidden="true"
            >
              {contactInitials(previewThread.clientName, previewThread.toNumber)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{previewThread.clientName?.trim() || previewThread.toNumber}</p>
              {previewThread.clientName?.trim() && <p className="truncate text-[11px] text-muted-foreground">{previewThread.toNumber}</p>}
            </div>
            {previewThread.unreadCount > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{previewThread.unreadCount} new</span>
            )}
          </div>
          {(() => {
            // Show the whole conversation where it fits. The card cannot be
            // scrolled - it is pointer-events-none so it never steals the click
            // on the row underneath - so anything we cannot show in full has to
            // be announced rather than silently cut off.
            const all = threadPreview(previewThread);
            const hidden = Math.max(0, all.length - PREVIEW_MESSAGE_LIMIT);
            return (
              <>
                {hidden > 0 && (
                  <div className="border-b bg-muted/20 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                    {hidden} earlier {hidden === 1 ? "message" : "messages"} not shown
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
                  <MessageThread
                    messages={all}
                    limit={hidden > 0 ? PREVIEW_MESSAGE_LIMIT : undefined}
                    compact
                    emptyText={previewThread.lastMessage ?? "No messages yet."}
                  />
                </div>
                <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                  {hidden > 0 ? "Click to open the full conversation" : "Click to reply"}
                </div>
              </>
            );
          })()}
        </div>,
        document.body,
      )}
    </DashboardLayout>
  );
}

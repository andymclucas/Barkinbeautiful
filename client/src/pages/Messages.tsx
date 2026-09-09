import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { MessageSquare, Send, Phone, CheckCircle2, XCircle, Clock, Search, RefreshCw, Trash2 } from "lucide-react";

const SMS_TEMPLATES = [
  { key: "reminder", label: "Appointment Reminder", preview: "Hi {name}! Just a reminder that {pet} has a grooming appointment at Barkin' Beautiful tomorrow. See you then! 🐾" },
  { key: "confirmation", label: "Booking Confirmation", preview: "Hi {name}! Your booking for {pet} at Barkin' Beautiful is confirmed. We can't wait to see them! 🐾" },
  { key: "ready_pickup", label: "Ready for Pick-up", preview: "Hi {name}! {pet} is all done and looking fabulous at Barkin' Beautiful. Come pick them up whenever you're ready! 🐾✨" },
  { key: "payment_failed", label: "Payment Failed", preview: "Hi {name}, we had trouble processing your Barkin' Beautiful membership payment for {pet}. Please update your payment details to keep your membership active." },
  { key: "custom", label: "Custom Message", preview: "" },
];

const TYPE_COLOURS: Record<string, string> = {
  reminder: "bg-blue-100 text-blue-700",
  confirmation: "bg-green-100 text-green-700",
  ready_pickup: "bg-emerald-100 text-emerald-700",
  payment_failed: "bg-red-100 text-red-700",
  tracker: "bg-indigo-100 text-indigo-700",
  custom: "bg-gray-100 text-gray-700",
  campaign: "bg-violet-100 text-violet-700",
  inbound: "bg-cyan-100 text-cyan-700",
};

export default function Messages() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [toNumber, setToNumber] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [customBody, setCustomBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data: logs, refetch } = trpc.sms.getLogs.useQuery({ tenantId: 1, limit: 100 });
  const { data: threads, refetch: refetchThreads } = trpc.sms.getThreads.useQuery({ tenantId: 1, limit: 50 });
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
    const when = new Date(log.appointmentStart).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
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

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Sent", value: stats.total, icon: MessageSquare, colour: "text-blue-600" },
            { label: "Delivered", value: stats.sent, icon: CheckCircle2, colour: "text-emerald-600" },
            { label: "Failed", value: stats.failed, icon: XCircle, colour: "text-red-600" },
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

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-sm text-blue-900">Automated Appointment Reminders</div>
              <p className="text-xs text-blue-700 mt-1">
                Three-stage reminders are ready: 4 days before, 2 days before, and the morning of each appointment.
                Each stage sends once per appointment and will only send after the salon explicitly enables live SMS automation.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-700 text-xs">SMS_AUTOMATION_ENABLED</Badge>
                <span className="text-xs text-blue-600">Set this environment variable to "true" in Render when you're ready to turn on automated reminders</span>
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

        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Inbound Reply Review Queue</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Replies never alter a booking until a staff member reviews and explicitly applies the recognised intent.</p>
              </div>
              <Badge className="bg-amber-100 text-amber-800 text-xs">{pendingInboundReplies.length} awaiting review</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {pendingInboundReplies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No inbound confirmation or cancellation replies are awaiting review.</p>
            ) : (
              <div className="space-y-2">
                {pendingInboundReplies.map((log: any) => (
                  <div key={log.id} className="flex flex-col gap-3 border-b border-amber-100 pb-3 last:border-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{log.clientName || log.toNumber} <span className="font-normal text-muted-foreground">replied “{log.body}”</span></div>
                      <div className="mt-1 text-xs text-muted-foreground">Booking: {appointmentContext(log)}</div>
                      <div className="mt-1 text-xs font-medium text-amber-800">Recognised intent: {log.replyIntent}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={log.replyIntent === "cancel" ? "text-red-700" : "text-emerald-700"}
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
            <CardTitle className="text-sm font-semibold">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!threads || threads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No conversations yet.</p>
            ) : (
              <div className="divide-y">
                {threads.map((thread: any) => (
                  <div
                    key={thread.threadKey}
                    className="w-full flex items-center gap-2 py-1 hover:bg-accent/50 transition-colors px-2 -mx-2 rounded-md group"
                  >
                    <button
                      className="flex-1 min-w-0 text-left py-2 flex items-center justify-between gap-3"
                      onClick={() => openThreadDialog({ clientId: thread.clientId, toNumber: thread.toNumber, clientName: thread.clientName })}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{thread.clientName?.trim() || thread.toNumber}</span>
                          {thread.unreadCount > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                              {thread.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {thread.lastDirection === "outbound" ? "You: " : ""}{thread.lastMessage}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {new Date(thread.lastAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    className="h-8 text-xs text-red-600 hover:text-red-700"
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
              <table className="w-full text-sm">
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
                        {log.sentAt ? new Date(log.sentAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
                      </td>
                      <td className="py-2.5 text-xs">
                        <div>{log.clientName || log.toNumber}{log.direction === "inbound" && <span className="ml-1 text-cyan-700">(reply)</span>}</div>
                        {log.clientName && <div className="text-muted-foreground">{log.toNumber}</div>}
                      </td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLOURS[log.type] ?? "bg-gray-100 text-gray-700"}`}>{log.type.replace(/_/g, " ")}</span>
                        {log.direction === "inbound" && log.replyIntent && log.replyIntent !== "unknown" && !log.processedAt && (
                          <div className="mt-1 text-[10px] font-medium text-amber-700">Review required: {log.replyIntent}</div>
                        )}
                        {log.direction === "inbound" && log.appointmentId && <div className="mt-1 text-[10px] text-muted-foreground">{appointmentContext(log)}</div>}
                        {log.direction === "inbound" && log.processedAt && <div className="mt-1 text-[10px] text-emerald-700">Reviewed: {log.reviewAction}{log.reviewerName ? ` by ${log.reviewerName}` : ""}</div>}
                      </td>
                      <td className="py-2.5 text-xs max-w-xs">
                        <div className="truncate text-muted-foreground" title={log.body}>{log.body}</div>
                      </td>
                      <td className="py-2.5 text-right">
                        {log.direction === "inbound" && log.replyIntent !== "unknown" && !log.processedAt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-7 text-xs ${log.replyIntent === "cancel" ? "text-red-700" : "text-emerald-700"}`}
                            disabled={reviewInboundMutation.isPending || !log.appointmentId}
                            onClick={() => reviewInboundMutation.mutate({ tenantId: 1, smsLogId: log.id, action: log.replyIntent })}
                          >
                            {log.replyIntent === "confirm" ? "Confirm appointment" : "Cancel booking"}
                          </Button>
                        ) : log.status === "delivered" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Delivered</span>
                        ) : log.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Sent</span>
                        ) : log.status === "received" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-cyan-600"><MessageSquare className="h-3.5 w-3.5" /> Received</span>
                        ) : log.status === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" /> Failed</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" /> Pending</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
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
                <Textarea placeholder="Type your message... Use {name} for client name, {pet} for pet name" value={customBody} onChange={e => setCustomBody(e.target.value)} className="mt-1 min-h-[100px]" />
                <div className="text-xs text-muted-foreground mt-1 text-right">{customBody.length}/1600</div>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{openThread?.clientName?.trim() || openThread?.toNumber}</DialogTitle>
            {openThread?.clientName && <p className="text-xs text-muted-foreground -mt-1">{openThread.toNumber}</p>}
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="flex flex-col gap-2 py-2">
              {threadMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No messages in this conversation yet.</p>
              )}
              {threadMessages.map((msg: any) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${isOutbound ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <div className={`mt-1 text-[10px] ${isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {new Date(msg.sentAt).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                        {isOutbound && ` · ${msg.status}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="flex justify-between items-center pt-2 border-t">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground hover:text-red-600"
              disabled={deleteThreadMutation.isPending}
              onClick={() => {
                if (!openThread) return;
                if (confirm(`Delete this entire conversation with ${openThread.clientName?.trim() || openThread.toNumber}? This can't be undone.`)) {
                  deleteThreadMutation.mutate(openThread.clientId ? { tenantId: 1, clientId: openThread.clientId } : { tenantId: 1, toNumber: openThread.toNumber });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete conversation
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                if (!openThread) return;
                setOpenThread(null);
                setToNumber(openThread.toNumber);
                setSelectedClientId(openThread.clientId);
                setClientSearch(openThread.clientId ? (openThread.clientName?.trim() || "") : "");
                setComposeOpen(true);
              }}
            >
              <Send className="h-3.5 w-3.5" /> Reply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

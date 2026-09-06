import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import {
  Mail, Users, BarChart2, PlusCircle, Send, Clock, FileText,
  Trash2, Edit3, Eye, ChevronDown, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const AUDIENCE_OPTIONS = [
  { value: "all_active",         label: "All Active Clients" },
  { value: "membership_holders", label: "Membership Holders" },
  { value: "inactive_8w",        label: "Inactive 8+ Weeks" },
  { value: "inactive_12w",       label: "Inactive 12+ Weeks" },
  { value: "all_clients",        label: "All Clients (including inactive)" },
];

const STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/15 text-blue-400",
  sending:   "bg-amber-500/15 text-amber-400",
  sent:      "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive",
};

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function openRate(opened: number | null, sent: number | null) {
  if (!sent || sent === 0) return "—";
  return `${Math.round(((opened ?? 0) / sent) * 100)}%`;
}

// ─── Composer Dialog ──────────────────────────────────────────────────────────
interface ComposerProps {
  open: boolean;
  onClose: () => void;
  editCampaignId?: number | null;
  onSaved: () => void;
}

function CampaignComposer({ open, onClose, editCampaignId, onSaved }: ComposerProps) {
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [audience, setAudience] = useState("all_active");

  // Load existing campaign for editing
  const { data: existing } = trpc.campaigns.get.useQuery(
    { id: editCampaignId! },
    { enabled: !!editCampaignId }
  );

  // Populate form when existing data loads
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setSubject(existing.subject);
      setPreviewText(existing.previewText ?? "");
      setBodyHtml(existing.bodyHtml);
      try {
        const f = JSON.parse(existing.audienceFilter ?? "{}");
        setAudience(f.type ?? "all_active");
      } catch { /* ignore */ }
    }
  }, [existing]);

  // Audience preview
  const { data: preview, isFetching: previewLoading } = trpc.campaigns.getAudiencePreview.useQuery(
    { tenantId: 1, audienceFilter: JSON.stringify({ type: audience }) },
    { enabled: open }
  );

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      toast.success("Campaign saved as draft");
      onSaved();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.campaigns.update.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      toast.success("Campaign updated");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setName(""); setSubject(""); setPreviewText(""); setBodyHtml(""); setAudience("all_active");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSave() {
    if (!name.trim()) { toast.error("Campaign name is required"); return; }
    if (!subject.trim()) { toast.error("Email subject is required"); return; }
    if (!bodyHtml.trim()) { toast.error("Email body is required"); return; }

    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      previewText: previewText.trim() || undefined,
      bodyHtml: bodyHtml.trim(),
      audienceFilter: JSON.stringify({ type: audience }),
    };

    if (editCampaignId) {
      updateMutation.mutate({ id: editCampaignId, ...payload });
    } else {
      createMutation.mutate({ tenantId: 1, ...payload });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editCampaignId ? "Edit Campaign" : "New Campaign"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Campaign name */}
          <div className="space-y-1.5">
            <Label>Campaign Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Spring Promotion 2026"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label>Email Subject <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. 🐾 Spring special — book now and save!"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          {/* Preview text */}
          <div className="space-y-1.5">
            <Label>Preview Text <span className="text-muted-foreground text-xs">(shown in inbox preview)</span></Label>
            <Input
              placeholder="e.g. Your pup deserves a fresh spring look…"
              value={previewText}
              onChange={e => setPreviewText(e.target.value)}
            />
          </div>

          {/* Audience */}
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Audience preview */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {previewLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Users className="h-3 w-3" />
              )}
              {previewLoading ? "Counting recipients…" : (
                preview
                  ? `${preview.count} recipient${preview.count !== 1 ? "s" : ""}${preview.sampleNames?.length ? ` — e.g. ${preview.sampleNames.slice(0, 3).join(", ")}` : ""}`
                  : "—"
              )}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label>Email Body (HTML or plain text) <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder={`<p>Hi there,</p>\n<p>We have an exciting offer for you...</p>\n<p>Book now at barkinbeautiful.com.au</p>`}
              value={bodyHtml}
              onChange={e => setBodyHtml(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              An unsubscribe link will be automatically appended to every email.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editCampaignId ? "Save Changes" : "Save as Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stats Dialog ─────────────────────────────────────────────────────────────
function StatsDialog({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { data, isLoading } = trpc.campaigns.getStats.useQuery({ campaignId });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Campaign Stats</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Recipients", value: data.campaign.totalRecipients ?? 0 },
                { label: "Sent", value: data.campaign.totalSent ?? 0 },
                { label: "Opened", value: data.campaign.totalOpened ?? 0 },
                { label: "Open Rate", value: openRate(data.campaign.totalOpened, data.campaign.totalSent) },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
            {data.sends.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent sends</p>
                <div className="divide-y divide-border/40 max-h-48 overflow-y-auto text-xs">
                  {data.sends.slice(0, 20).map(s => (
                    <div key={s.email} className="flex items-center justify-between py-1.5">
                      <span className="truncate max-w-[200px]">{s.email}</span>
                      <span className={`ml-2 shrink-0 ${s.status === "sent" ? "text-emerald-400" : "text-destructive"}`}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : <p className="text-sm text-muted-foreground py-4 text-center">No stats available.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Confirm Dialog ──────────────────────────────────────────────────────
function SendConfirmDialog({
  campaign,
  onConfirm,
  onClose,
  isSending,
}: {
  campaign: { id: number; name: string; subject: string; audienceFilter: string | null };
  onConfirm: () => void;
  onClose: () => void;
  isSending: boolean;
}) {
  const audienceType = (() => {
    try { return JSON.parse(campaign.audienceFilter ?? "{}").type ?? "all_active"; } catch { return "all_active"; }
  })();
  const audienceLabel = AUDIENCE_OPTIONS.find(o => o.value === audienceType)?.label ?? audienceType;

  const { data: preview } = trpc.campaigns.getAudiencePreview.useQuery({
    tenantId: 1,
    audienceFilter: JSON.stringify({ type: audienceType }),
  });

  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Campaign Now?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>You are about to send <strong>"{campaign.name}"</strong>.</p>
              <div className="rounded-md border border-border/60 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Subject</span><span className="font-medium max-w-[220px] truncate">{campaign.subject}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Audience</span><span className="font-medium">{audienceLabel}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Recipients</span><span className="font-medium">{preview?.count ?? "…"}</span></div>
              </div>
              <p className="text-muted-foreground text-xs">This will send immediately to all eligible recipients. This action cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSending} className="gap-2 bg-primary">
            {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmailCampaigns() {
  const utils = trpc.useUtils();

  const [composerOpen, setComposerOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [statsId, setStatsId] = useState<number | null>(null);
  const [sendTarget, setSendTarget] = useState<{ id: number; name: string; subject: string; audienceFilter: string | null } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = trpc.campaigns.list.useQuery({ tenantId: 1 });

  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); toast.success("Campaign deleted"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const sendMutation = trpc.campaigns.send.useMutation({
    onSuccess: (r) => {
      utils.campaigns.list.invalidate();
      toast.success(`Campaign sent to ${r.sent} of ${r.total} recipients`);
      setSendTarget(null);
    },
    onError: (e) => { toast.error(e.message); setSendTarget(null); },
  });

  // Summary stats
  const totalCampaigns = campaigns.length;
  const sentCampaigns = campaigns.filter(c => c.status === "sent");
  const avgOpenRate = sentCampaigns.length
    ? Math.round(sentCampaigns.reduce((acc, c) => acc + ((c.totalOpened ?? 0) / Math.max(c.totalSent ?? 1, 1)), 0) / sentCampaigns.length * 100)
    : null;

  // Active client count from audience preview
  const { data: allActivePreview } = trpc.campaigns.getAudiencePreview.useQuery({
    tenantId: 1,
    audienceFilter: JSON.stringify({ type: "all_active" }),
  });

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Campaigns</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create and send targeted email campaigns to your clients
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditId(null); setComposerOpen(true); }} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            New Campaign
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Campaigns</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{totalCampaigns}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sentCampaigns.length} sent</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Active Clients</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{allActivePreview?.count ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Eligible recipients</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BarChart2 className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Avg. Open Rate</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{avgOpenRate !== null ? `${avgOpenRate}%` : "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Industry avg: 22%</p>
            </CardContent>
          </Card>
        </div>

        {/* Campaign list */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">All Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-25" />
                <p className="font-medium text-sm">No campaigns yet</p>
                <p className="text-xs mt-1">Click <strong>New Campaign</strong> to create your first email campaign.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOURS[c.status] ?? "bg-muted text-muted-foreground"}`}>
                          {statusLabel(c.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.status === "sent"
                          ? `Sent ${c.sentAt ? new Date(c.sentAt).toLocaleDateString("en-AU") : "—"} · ${c.totalSent ?? 0} sent · ${openRate(c.totalOpened, c.totalSent)} open rate`
                          : c.status === "scheduled"
                          ? `Scheduled ${c.scheduledAt ? new Date(c.scheduledAt).toLocaleString("en-AU") : "—"}`
                          : `Created ${new Date(c.createdAt).toLocaleDateString("en-AU")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      {c.status === "sent" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View stats" onClick={() => setStatsId(c.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {(c.status === "draft" || c.status === "scheduled") && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditId(c.id); setComposerOpen(true); }}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-400"
                            title="Send now"
                            onClick={() => setSendTarget({ id: c.id, name: c.name, subject: c.subject, audienceFilter: c.audienceFilter ?? null })}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {c.status !== "sending" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" title="Delete" onClick={() => setDeleteId(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Composer dialog */}
      <CampaignComposer
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setEditId(null); }}
        editCampaignId={editId}
        onSaved={() => { setComposerOpen(false); setEditId(null); }}
      />

      {/* Stats dialog */}
      {statsId && <StatsDialog campaignId={statsId} onClose={() => setStatsId(null)} />}

      {/* Send confirm */}
      {sendTarget && (
        <SendConfirmDialog
          campaign={sendTarget}
          onConfirm={() => sendMutation.mutate({ tenantId: 1, campaignId: sendTarget.id })}
          onClose={() => setSendTarget(null)}
          isSending={sendMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the campaign and all send records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

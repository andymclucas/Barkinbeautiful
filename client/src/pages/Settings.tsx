import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Bell, Shield, Link, Palette, CreditCard, ExternalLink, ShieldCheck, Clock3, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: tenant } = trpc.settings.getTenantInfo.useQuery({ tenantId: 1 });
  const { data: stripeBilling, isLoading: stripeBillingLoading } = trpc.stripeBilling.getStatus.useQuery({ tenantId: 1 });
  const { data: timingReviewSettings, isLoading: timingReviewSettingsLoading } = trpc.workflowReview.getThresholds.useQuery({ tenantId: 1 });
  const [brand, setBrand] = useState({ primary: "#d61572", accent: "#f9d4e7", sidebar: "#2b1830", font: "Inter", logoUrl: "" });
  const [timingScope, setTimingScope] = useState<"default" | "size" | "breed">("default");
  const [timingSize, setTimingSize] = useState("small");
  const [timingBreed, setTimingBreed] = useState("");
  const [timingMinutes, setTimingMinutes] = useState({ bath: "90", dry: "75", groom: "150", total: "240" });
  useEffect(() => {
    if (tenant) setBrand({ primary: tenant.brandPrimary ?? "#d61572", accent: tenant.brandAccent ?? "#f9d4e7", sidebar: tenant.brandSidebar ?? "#2b1830", font: tenant.brandFont ?? "Inter", logoUrl: tenant.logoUrl ?? "" });
  }, [tenant]);
  useEffect(() => {
    const scopeKey = timingScope === "default" ? "default" : timingScope === "size" ? `size:${timingSize}` : `breed:${timingBreed.trim().toLocaleLowerCase("en-AU").replace(/\s+/g, " ")}`;
    const saved = timingReviewSettings?.rules.find((rule) => rule.scopeKey === scopeKey);
    const fallback = timingReviewSettings?.defaults ?? { bathMinutes: 90, dryMinutes: 75, groomMinutes: 150, totalMinutes: 240 };
    const values = saved ?? fallback;
    setTimingMinutes({ bath: String(values.bathMinutes), dry: String(values.dryMinutes), groom: String(values.groomMinutes), total: String(values.totalMinutes) });
  }, [timingReviewSettings, timingScope, timingSize, timingBreed]);
  const applyBrand = (next: typeof brand) => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", next.primary);
    root.style.setProperty("--brand-accent", next.accent);
    root.style.setProperty("--brand-sidebar", next.sidebar);
    root.style.setProperty("--font-sans", next.font);
  };
  const updateBrand = trpc.settings.updateTenantInfo.useMutation({
    onSuccess: () => { utils.settings.getTenantInfo.invalidate({ tenantId: 1 }); toast.success("Salon branding saved"); },
    onError: () => toast.error("Could not save salon branding"),
  });
  const saveTimingThreshold = trpc.workflowReview.upsertThreshold.useMutation({
    onSuccess: () => { utils.workflowReview.getThresholds.invalidate({ tenantId: 1 }); toast.success("Timing review threshold saved"); },
    onError: (error) => toast.error(error.message),
  });
  const resetTimingThreshold = trpc.workflowReview.removeThreshold.useMutation({
    onSuccess: () => { utils.workflowReview.getThresholds.invalidate({ tenantId: 1 }); toast.success("Timing review threshold reset to its fallback"); },
    onError: (error) => toast.error(error.message),
  });
  const timingScopeLabel = timingScope === "default" ? "Salon default" : timingScope === "size" ? timingReviewSettings?.sizePresets.find((preset) => preset.id === timingSize)?.label ?? "Size preset" : timingBreed.trim() || "Breed override";
  const canSaveTiming = timingScope !== "breed" || timingBreed.trim().length > 0;
  const saveTiming = () => saveTimingThreshold.mutate({
    tenantId: 1,
    scope: timingScope,
    petSize: timingScope === "size" ? timingSize as any : undefined,
    breedName: timingScope === "breed" ? timingBreed.trim() : undefined,
    bathMinutes: Math.max(1, Number(timingMinutes.bath) || 1),
    dryMinutes: Math.max(1, Number(timingMinutes.dry) || 1),
    groomMinutes: Math.max(1, Number(timingMinutes.groom) || 1),
    totalMinutes: Math.max(1, Number(timingMinutes.total) || 1),
  });
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your salon configuration and integrations</p>
        </div>

        <Tabs defaultValue="salon">
          <TabsList>
            <TabsTrigger value="salon">Salon</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="timing">Timing reviews</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="salon" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" /> Salon Details
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5"><Label>Business Name</Label><Input defaultValue="Barkin Beautiful Grooming Studio" /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input defaultValue="07 3823 4567" /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input defaultValue="barkinbeautiful@gmail.com" /></div>
                  <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input defaultValue="Brisbane, QLD" /></div>
                  <div className="space-y-1.5"><Label>Timezone</Label><Input defaultValue="Australia/Brisbane" /></div>
                  <div className="space-y-1.5"><Label>Currency</Label><Input defaultValue="AUD" /></div>
                </div>
                <Button onClick={() => toast.success("Settings saved")}>Save Changes</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="mt-4">
            <Card className="brand-lift overflow-hidden border-primary/20 bg-gradient-to-br from-white via-white to-primary/10">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /> White-label Salon Branding</CardTitle>
                <p className="text-sm text-muted-foreground">Set the platform colours for this salon. Each tenant can use its own visual identity.</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  {([
                    { key: "primary", label: "Primary colour", hint: "Buttons and key actions" },
                    { key: "accent", label: "Accent colour", hint: "Surfaces and highlights" },
                    { key: "sidebar", label: "Sidebar colour", hint: "Navigation foundation" },
                  ] as const).map(({ key, label, hint }) => (
                    <div key={key} className="rounded-xl border bg-white/75 p-3 space-y-2 brand-lift">
                      <Label>{label}</Label>
                      <div className="flex items-center gap-2"><input aria-label={label} type="color" value={brand[key]} onChange={e => { const next = { ...brand, [key]: e.target.value }; setBrand(next); applyBrand(next); }} className="h-9 w-11 rounded border cursor-pointer" /><Input value={brand[key]} onChange={e => { const next = { ...brand, [key]: e.target.value }; setBrand(next); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyBrand(next); }} /></div>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                  ))}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-white/75 p-3 space-y-2 brand-lift"><Label>Platform font</Label><select value={brand.font} onChange={e => { const next = { ...brand, font: e.target.value }; setBrand(next); applyBrand(next); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option>Inter</option><option>DM Sans</option><option>Plus Jakarta Sans</option><option>Manrope</option><option>Nunito Sans</option></select></div>
                  <div className="rounded-xl border bg-white/75 p-3 space-y-2 brand-lift"><Label>Custom salon logo</Label><Input type="file" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const res = await fetch("/api/upload/salon-logo", { method: "POST", headers: { "Content-Type": file.type }, body: file }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setBrand(v => ({ ...v, logoUrl: data.url })); toast.success("Logo uploaded. Save branding to apply it."); } catch { toast.error("Logo upload failed"); } }} /><p className="text-xs text-muted-foreground">PNG, JPG or WebP, max 5 MB.</p></div>
                </div>
                <div className="rounded-xl bg-[var(--brand-sidebar)] p-4 text-white flex items-center justify-between gap-4">
                  <div><p className="font-semibold">Live brand preview</p><p className="text-sm text-white/70">Navigation and shared dashboard surfaces update immediately.</p></div>
                  <span className="rounded-lg px-4 py-2 font-semibold" style={{ background: brand.primary }}>Save the look</span>
                </div>
                <Button disabled={updateBrand.isPending} onClick={() => updateBrand.mutate({ tenantId: 1, brandPrimary: brand.primary, brandAccent: brand.accent, brandSidebar: brand.sidebar, brandFont: brand.font as any, logoUrl: brand.logoUrl || undefined })}>{updateBrand.isPending ? "Saving…" : "Save branding"}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timing" className="mt-4">
            <Card className="border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-5 w-5 text-amber-700" /> Workflow timing review triggers</CardTitle><p className="text-sm text-muted-foreground">Set the active-stage minutes that prompt an administrator review. Breed overrides take priority, then pet-size presets, then the salon default. Waiting periods and cancelled or no-show bookings are excluded.</p></CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <div className="grid gap-3 rounded-xl border border-amber-200 bg-white/80 p-3 sm:grid-cols-[170px_1fr]">
                  <div className="space-y-1.5"><Label>Configure</Label><select value={timingScope} onChange={(event) => setTimingScope(event.target.value as typeof timingScope)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="default">Salon default</option><option value="size">Pet-size preset</option><option value="breed">Breed override</option></select></div>
                  {timingScope === "size" && <div className="space-y-1.5"><Label>Pet size</Label><select value={timingSize} onChange={(event) => setTimingSize(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{timingReviewSettings?.sizePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} · {preset.minKg}–{preset.maxKg} kg</option>)}</select></div>}
                  {timingScope === "breed" && <div className="space-y-1.5"><Label>Breed</Label><Input value={timingBreed} onChange={(event) => setTimingBreed(event.target.value)} placeholder="e.g. Standard Poodle" maxLength={100} /></div>}
                  {timingScope === "default" && <div className="self-end rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Applies when no matching size preset or breed override exists.</div>}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([
                  { key: "bath", label: "Bath", hint: "active bath" }, { key: "dry", label: "Dry", hint: "active dry" }, { key: "groom", label: "Groom", hint: "active groom" }, { key: "total", label: "Total", hint: "check-in to complete" },
                ] as const).map((metric) => <div key={metric.key} className="rounded-lg border bg-white p-3"><Label htmlFor={`timing-${metric.key}`} className="text-sm">{metric.label}</Label><div className="mt-1.5 flex items-center gap-1"><Input id={`timing-${metric.key}`} type="number" min="1" max="1440" value={timingMinutes[metric.key]} onChange={(event) => setTimingMinutes((current) => ({ ...current, [metric.key]: event.target.value }))} /><span className="text-xs text-muted-foreground">min</span></div><p className="mt-1 text-[11px] text-muted-foreground">{metric.hint}</p></div>)}</div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3"><p className="text-sm text-amber-950"><span className="font-semibold">Editing:</span> {timingScopeLabel}</p><div className="flex gap-2"><Button variant="outline" size="sm" className="gap-1 border-amber-300 bg-white text-amber-900 hover:bg-amber-100" onClick={() => resetTimingThreshold.mutate({ tenantId: 1, scope: timingScope, petSize: timingScope === "size" ? timingSize as any : undefined, breedName: timingScope === "breed" ? timingBreed.trim() : undefined })} disabled={resetTimingThreshold.isPending || !canSaveTiming}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button><Button size="sm" onClick={saveTiming} disabled={!canSaveTiming || saveTimingThreshold.isPending || timingReviewSettingsLoading}>{saveTimingThreshold.isPending ? "Saving…" : "Save trigger"}</Button></div></div>
                {(timingReviewSettings?.rules.length ?? 0) > 0 && <div className="rounded-lg border bg-white p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved overrides</p><div className="flex flex-wrap gap-2">{timingReviewSettings?.rules.map((rule) => <span key={rule.scopeKey} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">{rule.scope === "default" ? "Salon default" : rule.scope === "size" ? `Size · ${rule.petSize}` : `Breed · ${rule.breedName}`}</span>)}</div></div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" /> Notification Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3 text-sm">
                {[
                  { label: "Send Pet Tracker SMS on check-in", desc: "Automatically send the Pet Tracker link when a dog is checked in" },
                  { label: "Failed payment alerts", desc: "Notify staff when a membership payment fails" },
                  { label: "Appointment reminders", desc: "Send clients an SMS reminder 24h before their appointment" },
                  { label: "Low stock alerts", desc: "Alert when retail products reach the reorder threshold" },
                ].map(n => (
                  <div key={n.label} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toast.info("Feature coming soon")}>Configure</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="mt-4 space-y-4">
            {[
              { name: "Xero", desc: "Sync invoices, payroll, and reconciliations with Xero accounting", icon: "💼", status: "Not connected" },
              { name: "Twilio SMS", desc: "Send Pet Tracker links and appointment reminders via SMS", icon: "📱", status: "Not connected" },
              { name: "Square Payments", desc: "Process membership billing and retail payments", icon: "💳", status: "Not connected" },
            ].map(int => (
              <Card key={int.name}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{int.icon}</div>
                    <div>
                      <p className="font-semibold">{int.name}</p>
                      <p className="text-xs text-muted-foreground">{int.desc}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toast.info(`${int.name} integration coming soon`)}>
                    <Link className="h-3.5 w-3.5 mr-1.5" /> Connect
                  </Button>
                </CardContent>
              </Card>
            ))}
            <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3"><div className="text-2xl">⚡</div><div><p className="font-semibold">Stripe membership billing</p><p className="text-xs text-muted-foreground">Maps existing MoeGo membership references before any live billing is enabled.</p></div></div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${stripeBilling?.prototype ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{stripeBillingLoading ? "Checking…" : stripeBilling?.prototype ? "Prototype safe" : "Live"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border bg-background/70 p-2"><p className="text-muted-foreground">Active memberships</p><p className="text-base font-semibold">{stripeBilling?.activeMemberships ?? "—"}</p></div>
                  <div className="rounded-lg border bg-background/70 p-2"><p className="text-muted-foreground">MoeGo references</p><p className="text-base font-semibold">{stripeBilling?.moegoLinkedMemberships ?? "—"}</p></div>
                  <div className="rounded-lg border bg-background/70 p-2"><p className="text-muted-foreground">Stripe customers</p><p className="text-base font-semibold">{stripeBilling?.stripeMappedCustomers ?? "—"}</p></div>
                  <div className="rounded-lg border bg-background/70 p-2"><p className="text-muted-foreground">Subscriptions mapped</p><p className="text-base font-semibold">{stripeBilling?.stripeMappedSubscriptions ?? "—"}</p></div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>{stripeBilling?.safetyMessage ?? "Stripe status is loading. No client charges are initiated from Groomigo during prototype setup."}</p></div>
                <Button variant="outline" size="sm" onClick={() => window.open("https://dashboard.stripe.com", "_blank", "noopener,noreferrer")}><CreditCard className="mr-1.5 h-3.5 w-3.5" /> Open Stripe dashboard <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" /> Security & Access
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3 text-sm">
                <p className="text-muted-foreground">Role-based access control is managed per staff member. Owners and managers have full access. Groomers and bathers can view and update their own appointments only.</p>
                <Button variant="outline" onClick={() => toast.info("Access control management coming soon")}>Manage Permissions</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

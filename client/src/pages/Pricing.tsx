import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Pencil, Plus, Power, Tags, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ServiceRecord = {
  id: number;
  catalogueType: "service" | "add_on";
  name: string;
  code: string;
  description: string | null;
  priceAud: string;
  durationMinutes: number | null;
  legacyServiceType: string | null;
  weightBand: string | null;
  isActive: boolean;
  sortOrder: number;
};

type MembershipPlanRecord = {
  id: number;
  name: string;
  code: string;
  tier: string;
  serviceVariant: string | null;
  weightBand: string | null;
  weeklyPriceAud: string;
  billingCycleWeeks: number;
  appointmentIntervalWeeks: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

const emptyServiceForm = (catalogueType: "service" | "add_on") => ({
  catalogueType,
  name: "",
  code: "",
  description: "",
  priceAud: "",
  durationMinutes: "",
  legacyServiceType: "",
  weightBand: "",
  isActive: true,
  sortOrder: "0",
});

const emptyPlanForm = () => ({
  name: "",
  code: "",
  tier: "",
  serviceVariant: "",
  weightBand: "",
  weeklyPriceAud: "",
  billingCycleWeeks: "1",
  appointmentIntervalWeeks: "",
  description: "",
  isActive: true,
  sortOrder: "0",
});

const aud = (amount: string | number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(amount));

export default function Pricing() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"services" | "add-ons" | "memberships">("services");
  const [serviceEditor, setServiceEditor] = useState<{ record?: ServiceRecord; form: ReturnType<typeof emptyServiceForm> } | null>(null);
  const [planEditor, setPlanEditor] = useState<{ record?: MembershipPlanRecord; form: ReturnType<typeof emptyPlanForm> } | null>(null);

  const { data: serviceRows = [], isLoading: servicesLoading } = trpc.pricing.listServices.useQuery(
    { tenantId: 1 },
    { enabled: user?.role === "admin" }
  );
  const { data: planRows = [], isLoading: plansLoading } = trpc.pricing.listMembershipPlans.useQuery(
    { tenantId: 1 },
    { enabled: user?.role === "admin" }
  );

  const services = useMemo(() => serviceRows.filter((row) => row.catalogueType === "service"), [serviceRows]);
  const addOns = useMemo(() => serviceRows.filter((row) => row.catalogueType === "add_on"), [serviceRows]);
  const refresh = () => Promise.all([utils.pricing.listServices.invalidate(), utils.pricing.listMembershipPlans.invalidate()]);

  const serviceMutation = trpc.pricing.createService.useMutation({
    onSuccess: async () => { await refresh(); setServiceEditor(null); toast.success("Catalogue item saved"); },
    onError: (error) => toast.error(error.message),
  });
  const updateServiceMutation = trpc.pricing.updateService.useMutation({
    onSuccess: async () => { await refresh(); setServiceEditor(null); toast.success("Catalogue item updated"); },
    onError: (error) => toast.error(error.message),
  });
  const deleteServiceMutation = trpc.pricing.deleteService.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Catalogue item removed"); },
    onError: (error) => toast.error(error.message),
  });
  const planMutation = trpc.pricing.createMembershipPlan.useMutation({
    onSuccess: async () => { await refresh(); setPlanEditor(null); toast.success("Membership plan saved"); },
    onError: (error) => toast.error(error.message),
  });
  const updatePlanMutation = trpc.pricing.updateMembershipPlan.useMutation({
    onSuccess: async () => { await refresh(); setPlanEditor(null); toast.success("Membership plan updated"); },
    onError: (error) => toast.error(error.message),
  });
  const deletePlanMutation = trpc.pricing.deleteMembershipPlan.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Membership plan removed"); },
    onError: (error) => toast.error(error.message),
  });

  const openServiceEditor = (catalogueType: "service" | "add_on", record?: ServiceRecord) => {
    setServiceEditor({
      record,
      form: record ? {
        catalogueType: record.catalogueType,
        name: record.name,
        code: record.code,
        description: record.description ?? "",
        priceAud: String(record.priceAud),
        durationMinutes: record.durationMinutes === null ? "" : String(record.durationMinutes),
        legacyServiceType: record.legacyServiceType ?? "",
        weightBand: record.weightBand ?? "",
        isActive: record.isActive,
        sortOrder: String(record.sortOrder),
      } : emptyServiceForm(catalogueType),
    });
  };

  const openPlanEditor = (record?: MembershipPlanRecord) => {
    setPlanEditor({
      record,
      form: record ? {
        name: record.name,
        code: record.code,
        tier: record.tier,
        serviceVariant: record.serviceVariant ?? "",
        weightBand: record.weightBand ?? "",
        weeklyPriceAud: String(record.weeklyPriceAud),
        billingCycleWeeks: String(record.billingCycleWeeks),
        appointmentIntervalWeeks: String(record.appointmentIntervalWeeks),
        description: record.description ?? "",
        isActive: record.isActive,
        sortOrder: String(record.sortOrder),
      } : emptyPlanForm(),
    });
  };

  if (loading) return <DashboardLayout><div className="text-sm text-muted-foreground">Loading pricing catalogue…</div></DashboardLayout>;
  if (user?.role !== "admin") {
    return <DashboardLayout><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><h1 className="font-semibold">Administrator access required</h1><p className="mt-1 text-sm">Pricing &amp; Services is available only to salon administrators.</p></div></DashboardLayout>;
  }

  const currentServiceRows = activeTab === "services" ? services : addOns;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary"><Tags className="h-5 w-5" /><span className="text-sm font-semibold tracking-wide">CATALOGUE FOUNDATION</span></div>
            <h1 className="mt-1 text-2xl font-bold font-display">Pricing &amp; Services</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Maintain the future service, add-on and membership catalogue. Existing bookings, membership amounts and historical pricing are unchanged until a separate cutover is approved.</p>
          </div>
          <Button onClick={() => activeTab === "memberships" ? openPlanEditor() : openServiceEditor(activeTab === "services" ? "service" : "add_on")} className="gap-2"><Plus className="h-4 w-4" /> Add {activeTab === "memberships" ? "Membership Plan" : activeTab === "services" ? "Service" : "Add-on"}</Button>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3 sm:w-[440px]">
            <TabsTrigger value="services">Services <span className="ml-1 text-xs text-muted-foreground">{services.length}</span></TabsTrigger>
            <TabsTrigger value="add-ons">Add-ons <span className="ml-1 text-xs text-muted-foreground">{addOns.length}</span></TabsTrigger>
            <TabsTrigger value="memberships">Memberships <span className="ml-1 text-xs text-muted-foreground">{planRows.length}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-4"><CatalogueTable rows={services} loading={servicesLoading} onEdit={(record) => openServiceEditor("service", record)} onDelete={(record) => { if (window.confirm(`Remove ${record.name} from the catalogue? This does not change historical records.`)) deleteServiceMutation.mutate({ tenantId: 1, id: record.id }); }} /></TabsContent>
          <TabsContent value="add-ons" className="mt-4"><CatalogueTable rows={addOns} loading={servicesLoading} onEdit={(record) => openServiceEditor("add_on", record)} onDelete={(record) => { if (window.confirm(`Remove ${record.name} from the catalogue? This does not change historical records.`)) deleteServiceMutation.mutate({ tenantId: 1, id: record.id }); }} /></TabsContent>
          <TabsContent value="memberships" className="mt-4"><MembershipPlanTable rows={planRows} loading={plansLoading} onEdit={openPlanEditor} onDelete={(record) => { if (window.confirm(`Remove ${record.name} from the catalogue? This does not change existing memberships.`)) deletePlanMutation.mutate({ tenantId: 1, id: record.id }); }} /></TabsContent>
        </Tabs>
      </div>

      <Dialog open={Boolean(serviceEditor)} onOpenChange={(open) => !open && setServiceEditor(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{serviceEditor?.record ? "Edit" : "Add"} {serviceEditor?.form.catalogueType === "add_on" ? "Add-on" : "Service"}</DialogTitle></DialogHeader>
          {serviceEditor && <ServiceForm form={serviceEditor.form} onChange={(form) => setServiceEditor((current) => current ? { ...current, form } : current)} />}
          <DialogFooter><Button variant="outline" onClick={() => setServiceEditor(null)}>Cancel</Button><Button disabled={!serviceEditor?.form.name || !serviceEditor?.form.code || !serviceEditor?.form.priceAud || serviceMutation.isPending || updateServiceMutation.isPending} onClick={() => {
            if (!serviceEditor) return;
            const { form, record } = serviceEditor;
            const payload = { tenantId: 1, catalogueType: form.catalogueType, name: form.name, code: form.code, description: form.description || undefined, priceAud: Number(form.priceAud), durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined, legacyServiceType: form.legacyServiceType || undefined, weightBand: form.weightBand || undefined, isActive: form.isActive, sortOrder: Number(form.sortOrder || 0) };
            if (record) updateServiceMutation.mutate({ ...payload, id: record.id }); else serviceMutation.mutate(payload);
          }}>{serviceEditor?.record ? "Save Changes" : "Add to Catalogue"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(planEditor)} onOpenChange={(open) => !open && setPlanEditor(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{planEditor?.record ? "Edit Membership Plan" : "Add Membership Plan"}</DialogTitle></DialogHeader>
          {planEditor && <MembershipPlanForm form={planEditor.form} onChange={(form) => setPlanEditor((current) => current ? { ...current, form } : current)} />}
          <DialogFooter><Button variant="outline" onClick={() => setPlanEditor(null)}>Cancel</Button><Button disabled={!planEditor?.form.name || !planEditor?.form.code || !planEditor?.form.tier || !planEditor?.form.weeklyPriceAud || !planEditor?.form.appointmentIntervalWeeks || planMutation.isPending || updatePlanMutation.isPending} onClick={() => {
            if (!planEditor) return;
            const { form, record } = planEditor;
            const payload = { tenantId: 1, name: form.name, code: form.code, tier: form.tier, serviceVariant: form.serviceVariant || undefined, weightBand: form.weightBand || undefined, weeklyPriceAud: Number(form.weeklyPriceAud), billingCycleWeeks: Number(form.billingCycleWeeks || 1), appointmentIntervalWeeks: Number(form.appointmentIntervalWeeks), description: form.description || undefined, isActive: form.isActive, sortOrder: Number(form.sortOrder || 0) };
            if (record) updatePlanMutation.mutate({ ...payload, id: record.id }); else planMutation.mutate(payload);
          }}>{planEditor?.record ? "Save Changes" : "Add Plan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function CatalogueTable({ rows, loading, onEdit, onDelete }: { rows: ServiceRecord[]; loading: boolean; onEdit: (record: ServiceRecord) => void; onDelete: (record: ServiceRecord) => void }) {
  return <div className="overflow-hidden rounded-xl border bg-card"><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="p-3 text-left font-medium text-muted-foreground">Name</th><th className="hidden p-3 text-left font-medium text-muted-foreground md:table-cell">Code</th><th className="hidden p-3 text-left font-medium text-muted-foreground lg:table-cell">Details</th><th className="p-3 text-right font-medium text-muted-foreground">Price</th><th className="p-3 text-right font-medium text-muted-foreground">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Loading catalogue…</td></tr> : rows.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No catalogue items yet. Add your first item when you are ready.</td></tr> : rows.map((record) => <tr key={record.id} className="border-b last:border-0 hover:bg-muted/20"><td className="p-3"><div className="flex items-center gap-2"><span className="font-medium">{record.name}</span>{record.isActive ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</div>{record.description && <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{record.description}</p>}</td><td className="hidden p-3 font-mono text-xs text-muted-foreground md:table-cell">{record.code}</td><td className="hidden p-3 text-muted-foreground lg:table-cell">{record.durationMinutes ? `${record.durationMinutes} min` : "No duration"}{record.weightBand ? ` · ${record.weightBand}` : ""}</td><td className="p-3 text-right font-medium">{aud(record.priceAud)}</td><td className="p-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(record)} aria-label={`Edit ${record.name}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(record)} aria-label={`Remove ${record.name}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>;
}

function MembershipPlanTable({ rows, loading, onEdit, onDelete }: { rows: MembershipPlanRecord[]; loading: boolean; onEdit: (record: MembershipPlanRecord) => void; onDelete: (record: MembershipPlanRecord) => void }) {
  return <div className="overflow-hidden rounded-xl border bg-card"><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="p-3 text-left font-medium text-muted-foreground">Plan</th><th className="hidden p-3 text-left font-medium text-muted-foreground md:table-cell">Frequency</th><th className="p-3 text-right font-medium text-muted-foreground">Weekly price</th><th className="p-3 text-right font-medium text-muted-foreground">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">Loading plans…</td></tr> : rows.length === 0 ? <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">No membership plans yet. Existing memberships are unchanged.</td></tr> : rows.map((record) => <tr key={record.id} className="border-b last:border-0 hover:bg-muted/20"><td className="p-3"><div className="flex items-center gap-2"><span className="font-medium">{record.name}</span>{record.isActive ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{record.tier}{record.serviceVariant ? ` · ${record.serviceVariant}` : ""}{record.weightBand ? ` · ${record.weightBand}` : ""}</p></td><td className="hidden p-3 text-muted-foreground md:table-cell">Every {record.appointmentIntervalWeeks} weeks</td><td className="p-3 text-right font-medium">{aud(record.weeklyPriceAud)}</td><td className="p-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(record)} aria-label={`Edit ${record.name}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(record)} aria-label={`Remove ${record.name}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>;
}

function ServiceForm({ form, onChange }: { form: ReturnType<typeof emptyServiceForm>; onChange: (form: ReturnType<typeof emptyServiceForm>) => void }) {
  const update = (key: keyof typeof form, value: string | boolean) => onChange({ ...form, [key]: value });
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Catalogue type</Label><select value={form.catalogueType} onChange={(event) => update("catalogueType", event.target.value as "service" | "add_on")} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="service">Service</option><option value="add_on">Add-on</option></select></div><div className="space-y-1.5"><Label>Sort order</Label><Input type="number" min="0" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></div><div className="space-y-1.5 sm:col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Full Groom" /></div><div className="space-y-1.5"><Label>Unique code *</Label><Input value={form.code} onChange={(event) => update("code", event.target.value)} placeholder="e.g. full-groom" /></div><div className="space-y-1.5"><Label>Price (AUD) *</Label><Input type="number" min="0" step="0.01" value={form.priceAud} onChange={(event) => update("priceAud", event.target.value)} /></div><div className="space-y-1.5"><Label>Duration (minutes)</Label><Input type="number" min="1" value={form.durationMinutes} onChange={(event) => update("durationMinutes", event.target.value)} /></div><div className="space-y-1.5"><Label>Legacy service key</Label><Input value={form.legacyServiceType} onChange={(event) => update("legacyServiceType", event.target.value)} placeholder="e.g. classic_groom" /></div><div className="space-y-1.5 sm:col-span-2"><Label>Weight band</Label><Input value={form.weightBand} onChange={(event) => update("weightBand", event.target.value)} placeholder="Optional, e.g. Large 17–25kg" /></div><div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><textarea value={form.description} onChange={(event) => update("description", event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Optional internal description" /></div><label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => update("isActive", event.target.checked)} /> Active and ready for future use</label></div>;
}

function MembershipPlanForm({ form, onChange }: { form: ReturnType<typeof emptyPlanForm>; onChange: (form: ReturnType<typeof emptyPlanForm>) => void }) {
  const update = (key: keyof typeof form, value: string | boolean) => onChange({ ...form, [key]: value });
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5 sm:col-span-2"><Label>Plan name *</Label><Input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Gold Classic Small" /></div><div className="space-y-1.5"><Label>Unique code *</Label><Input value={form.code} onChange={(event) => update("code", event.target.value)} placeholder="e.g. gold-classic-small" /></div><div className="space-y-1.5"><Label>Tier *</Label><Input value={form.tier} onChange={(event) => update("tier", event.target.value)} placeholder="e.g. Gold" /></div><div className="space-y-1.5"><Label>Service variant</Label><Input value={form.serviceVariant} onChange={(event) => update("serviceVariant", event.target.value)} placeholder="e.g. Classic" /></div><div className="space-y-1.5"><Label>Weight band</Label><Input value={form.weightBand} onChange={(event) => update("weightBand", event.target.value)} placeholder="e.g. Small 0–10kg" /></div><div className="space-y-1.5"><Label>Weekly price (AUD) *</Label><Input type="number" min="0" step="0.01" value={form.weeklyPriceAud} onChange={(event) => update("weeklyPriceAud", event.target.value)} /></div><div className="space-y-1.5"><Label>Appointment interval (weeks) *</Label><Input type="number" min="1" value={form.appointmentIntervalWeeks} onChange={(event) => update("appointmentIntervalWeeks", event.target.value)} /></div><div className="space-y-1.5"><Label>Billing cycle (weeks)</Label><Input type="number" min="1" value={form.billingCycleWeeks} onChange={(event) => update("billingCycleWeeks", event.target.value)} /></div><div className="space-y-1.5"><Label>Sort order</Label><Input type="number" min="0" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></div><div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><textarea value={form.description} onChange={(event) => update("description", event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Optional internal description" /></div><label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => update("isActive", event.target.checked)} /> Active and ready for future use</label></div>;
}

import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Database, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const STATUS_COLOURS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export default function Migration() {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: jobs, refetch } = trpc.migration.listJobs.useQuery({ tenantId: 1 });
  const createJobMutation = trpc.migration.createJob.useMutation();
  const importMutation = trpc.migration.importClients.useMutation({
    onSuccess: (res) => {
      toast.success(`Import complete: ${res.processed} records imported, ${res.errors} errors`);
      setImporting(false);
      refetch();
    },
    onError: (e) => { toast.error(e.message); setImporting(false); },
  });

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
    const records = lines.slice(1).map(line => {
      const cols = line.split(",");
      const get = (key: string) => cols[headers.indexOf(key)]?.trim().replace(/^"|"$/g, "") || undefined;
      return {
        firstName: get("firstname") ?? get("first") ?? "",
        lastName: get("lastname") ?? get("last") ?? "",
        email: get("email"),
        phone: get("phone") ?? get("mobile"),
        moegoClientId: get("id") ?? get("clientid"),
      };
    }).filter(r => r.firstName);

    if (records.length === 0) {
      toast.error("No valid records found in CSV. Ensure columns: firstName, lastName, email, phone");
      setImporting(false);
      return;
    }

    await createJobMutation.mutateAsync({ tenantId: 1, type: "csv_import" });

    // Get the job ID from the latest job
    const latestJobs = await refetch();
    const latestJob = latestJobs.data?.[0];
    if (!latestJob) { setImporting(false); return; }

    importMutation.mutate({ tenantId: 1, jobId: latestJob.id, records });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Data Migration</h1>
          <p className="text-sm text-muted-foreground">Import clients, pets, appointments, and memberships from MoeGo or CSV files</p>
        </div>

        <Tabs defaultValue="csv">
          <TabsList>
            <TabsTrigger value="csv">CSV Import</TabsTrigger>
            <TabsTrigger value="moego">MoeGo Extract</TabsTrigger>
            <TabsTrigger value="history">Job History ({jobs?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" /> Import Clients from CSV
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
                  <p className="font-semibold">CSV Format Requirements</p>
                  <p>Your CSV must include these column headers (case-insensitive):</p>
                  <code className="block bg-blue-100 rounded p-2 text-xs font-mono">firstName, lastName, email, phone, moegoClientId</code>
                  <p className="text-xs">To export from MoeGo: Customer Centre → Export → Download CSV</p>
                </div>
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Click to upload CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports up to 10,000+ records</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                {importing && (
                  <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                    Processing import... this may take a moment for large files.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="moego" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" /> MoeGo Automated Extract
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> MoeGo API Access Required</p>
                  <p className="mt-1">MoeGo does not have a public API. Automated extraction requires your MoeGo login credentials and uses browser automation to export all data. This process typically takes 15–30 minutes for large accounts.</p>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium">What will be extracted:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["All clients (10,000+)", "All pets & profiles", "Appointment history", "Active memberships", "Staff records", "Retail products"].map(item => (
                      <div key={item} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={() => toast.info("MoeGo extraction requires server-side automation. Contact your GSOS administrator to run this process.")}>
                  <Database className="h-4 w-4" /> Start MoeGo Extract
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="bg-card rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">Job</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Records</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Errors</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {!jobs?.length && (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No migration jobs yet.</td></tr>
                  )}
                  {jobs?.map(j => (
                    <tr key={j.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">#{j.id}</td>
                      <td className="p-3 text-muted-foreground">{j.type.replace("_", " ")}</td>
                      <td className="p-3 text-right">{j.processedRecords ?? "—"}</td>
                      <td className="p-3 text-right">{j.errorCount ? <span className="text-red-600">{j.errorCount}</span> : "0"}</td>
                      <td className="p-3">
                        <Badge className={`text-xs ${STATUS_COLOURS[j.status]}`}>{j.status}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(j.createdAt).toLocaleDateString("en-AU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

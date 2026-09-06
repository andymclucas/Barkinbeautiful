import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { Dog, LogOut, RefreshCw, ChevronRight, CalendarDays, Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";

const NEXT_STAGE: Record<string, { state: "checked_in" | "bathing" | "drying" | "grooming" | "ready" | "complete"; label: string }> = {
  scheduled: { state: "checked_in", label: "Check in" },
  checked_in: { state: "bathing", label: "Start bath" },
  bathing: { state: "drying", label: "Start drying" },
  drying: { state: "grooming", label: "Start grooming" },
  grooming: { state: "ready", label: "Mark ready" },
  ready: { state: "complete", label: "Complete" },
};

const STAGE_COLOURS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700", checked_in: "bg-cyan-100 text-cyan-800", bathing: "bg-blue-100 text-blue-800",
  drying: "bg-violet-100 text-violet-800", grooming: "bg-amber-100 text-amber-800", ready: "bg-emerald-100 text-emerald-800", complete: "bg-emerald-700 text-white",
};

function formatTime(value: Date | string | number) {
  return new Date(value).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
}

function GroomingCardPhotoUpload({ appointmentId, petId }: { appointmentId: number; petId: number | null }) {
  const [uploading, setUploading] = useState<"before" | "after" | null>(null);
  const attachPhoto = trpc.groomingReports.attachStaffPhoto.useMutation({
    onSuccess: () => toast.success("Grooming-card photo saved"),
    onError: (error) => toast.error(error.message),
  });
  const upload = async (position: "before" | "after", file: File) => {
    if (!petId) return toast.error("This appointment does not have a pet linked");
    setUploading(position);
    try {
      const response = await fetch(`/api/upload/staff-grooming-card-photo?appointmentId=${appointmentId}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Photo upload failed");
      attachPhoto.mutate({ appointmentId, petId, position, photoUrl: payload.url, photoKey: payload.key });
    } catch (error: any) {
      toast.error(error.message ?? "Photo upload failed");
    } finally {
      setUploading(null);
    }
  };
  return <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
    <p className="text-xs font-semibold text-teal-950">Grooming card photos</p>
    <p className="mt-0.5 text-[11px] text-teal-800">Use your phone camera to add before and after photos for this assigned pet.</p>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {(["before", "after"] as const).map(position => <label key={position} className="flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-white px-2 text-xs font-semibold text-teal-800 active:scale-[0.98]">
        {position === "before" ? <Camera className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
        <span>{uploading === position ? "Uploading…" : `${position === "before" ? "Before" : "After"} photo`}</span>
        <Input className="sr-only" type="file" accept="image/*" capture="environment" disabled={uploading !== null || attachPhoto.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(position, file); event.currentTarget.value = ""; }} />
      </label>)}
    </div>
  </div>;
}

export default function StaffPortal() {
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.staff.getMyPortal.useQuery(undefined, { enabled: !!user && user.role !== "admin" });
  const updateStage = trpc.workflow.updateStage.useMutation({
    onSuccess: () => { toast.success("Workflow updated"); refetch(); utils.workflow.getBoard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const dateLabel = useMemo(() => new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }), []);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading Groomigo…</div>;
  if (!user) { window.location.href = "/login"; return null; }
  if (user.role === "admin") { window.location.href = "/"; return null; }
  if (user.role === "staff") { window.location.href = "/calendar"; return null; }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <header className="bg-slate-950 text-white px-5 pt-6 pb-5 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><img src="/groomigo_logo.png" alt="Groomigo" className="h-9 w-auto object-contain" /><span className="text-xs text-teal-300 font-semibold tracking-wide uppercase">My day</span></div>
          <button className="p-2 rounded-lg hover:bg-white/10" onClick={() => logout()} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
        <div className="mt-6"><p className="text-sm text-slate-300">{dateLabel}</p><h1 className="text-2xl font-bold">{data?.staff.name ?? user.name ?? "My appointments"}</h1><p className="text-sm text-teal-300 mt-1">{data?.appointments.length ?? 0} pets assigned to you</p></div>
      </header>

      <div className="max-w-xl mx-auto px-4 pt-5">
        <div className="flex items-center justify-between mb-4"><div><p className="text-sm font-semibold text-slate-700">My appointments</p><p className="text-xs text-slate-500">View-only bookings · update workflow below</p></div><Button size="sm" variant="ghost" className="gap-1.5" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button></div>
        {isLoading && <div className="py-16 text-center text-slate-500">Loading appointments…</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message}</div>}
        {!isLoading && !error && (data?.appointments.length ?? 0) === 0 && <div className="rounded-2xl bg-white border p-10 text-center"><Dog className="h-9 w-9 text-teal-500 mx-auto mb-3" /><p className="font-semibold">No pets assigned today</p><p className="text-sm text-slate-500 mt-1">Your appointments will appear here when they are assigned to you.</p></div>}
        <div className="space-y-3">
          {data?.appointments.map(appt => {
            const next = NEXT_STAGE[appt.workflowState ?? "scheduled"];
            const owner = `${appt.clientFirstName ?? ""} ${appt.clientLastName ?? ""}`.trim();
            return <article key={appt.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-lg leading-tight">{appt.petName}</p><p className="text-sm text-slate-500">{owner}{appt.petBreed ? ` · ${appt.petBreed}` : ""}</p></div><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STAGE_COLOURS[appt.workflowState ?? "scheduled"]}`}>{(appt.workflowState ?? "scheduled").replace("_", " ")}</span></div>
              <div className="mt-3 flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-slate-400" /><span>{formatTime(appt.scheduledStart)}{appt.serviceType ? ` · ${appt.serviceType}` : ""}</span></div>
              {appt.notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{appt.notes}</p>}
              <div className="mt-4">{next ? <Button className="w-full gap-1" disabled={updateStage.isPending} onClick={() => updateStage.mutate({ appointmentId: appt.id, workflowState: next.state })}>{next.label}<ChevronRight className="h-4 w-4" /></Button> : <Button className="w-full" disabled variant="secondary">Completed</Button>}</div>
              <GroomingCardPhotoUpload appointmentId={appt.id} petId={appt.petId} />
            </article>;
          })}
        </div>
      </div>
    </main>
  );
}

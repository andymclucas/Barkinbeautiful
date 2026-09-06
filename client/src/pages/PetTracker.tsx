import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { Dog, Phone, CheckCircle2, Circle, Clock } from "lucide-react";

const STAGES = [
  { key: "scheduled",  label: "Appointment Booked",  icon: "📅", desc: "Your appointment is confirmed." },
  { key: "checked_in", label: "Checked In",           icon: "🚪", desc: "Your dog has arrived and is being settled in." },
  { key: "bathing",    label: "Bath Time",            icon: "🛁", desc: "Your dog is getting a fresh bath and blow dry." },
  { key: "grooming",   label: "Grooming",             icon: "✂️", desc: "Our groomer is working their magic!" },
  { key: "ready",      label: "Ready for Pickup! 🎉", icon: "🐾", desc: "Your dog is looking fabulous and ready to go home." },
  { key: "complete",   label: "All Done",             icon: "✅", desc: "Appointment complete. See you next time!" },
] as const;

type StageKey = typeof STAGES[number]["key"];

const STAGE_ORDER: Record<StageKey, number> = {
  scheduled: 0, checked_in: 1, bathing: 2, grooming: 3, ready: 4, complete: 5,
};

export default function PetTracker() {
  const params = useParams<{ token: string }>();
  const { data, isLoading, error } = trpc.tracker.getByToken.useQuery(
    { token: params.token ?? "" },
    { enabled: !!params.token, refetchInterval: 30000 }
  );

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
      <div className="text-center space-y-3">
        <div className="text-4xl animate-bounce">🐾</div>
        <p className="text-muted-foreground">Loading tracker...</p>
      </div>
    </div>
  );

  if (!data || error) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
      <div className="text-center space-y-3 max-w-sm">
        <div className="text-5xl">🐕</div>
        <h2 className="text-xl font-bold font-display">Tracker Not Found</h2>
        <p className="text-muted-foreground text-sm">This link may have expired or is invalid. Please contact the salon directly.</p>
      </div>
    </div>
  );

  const currentStageIdx = STAGE_ORDER[data.workflowState as StageKey] ?? 0;
  const currentStage = STAGES[currentStageIdx];
  const isReady = data.workflowState === "ready";
  const isComplete = data.workflowState === "complete";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <Dog className="h-5 w-5 text-primary" />
          <span className="font-bold font-display text-primary">{data.tenantName}</span>
        </div>
        {data.tenantPhone && (
          <a href={`tel:${data.tenantPhone}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
            <Phone className="h-4 w-4" />
            {data.tenantPhone}
          </a>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Pet info */}
        <div className="text-center space-y-2">
          <div className={`text-6xl transition-all duration-500 ${isReady ? "animate-bounce" : ""}`}>
            {currentStage?.icon}
          </div>
          <h1 className="text-2xl font-bold font-display">
            {data.petName} is {isReady ? "ready!" : isComplete ? "all done!" : "in the salon"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Hi {data.clientFirstName}! Here's a live update on {data.petName}'s grooming session.
          </p>
        </div>

        {/* Current stage highlight */}
        <div className={`rounded-2xl p-5 text-center ${isReady ? "bg-emerald-50 border-2 border-emerald-300" : "bg-primary/5 border-2 border-primary/20"}`}>
          <p className={`text-lg font-bold font-display ${isReady ? "text-emerald-700" : "text-primary"}`}>
            {currentStage?.label}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{currentStage?.desc}</p>
          {data.estimatedPickupAt && !isComplete && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Est. pickup: <strong className="text-foreground">
                  {new Date(data.estimatedPickupAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Progress steps */}
        <div className="space-y-3">
          {STAGES.filter(s => s.key !== "complete").map((stage, idx) => {
            const done = idx < currentStageIdx;
            const active = idx === currentStageIdx;
            return (
              <div key={stage.key} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${active ? "bg-primary/5 border border-primary/20" : done ? "opacity-60" : "opacity-40"}`}>
                <div className="flex-shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : active ? (
                    <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                  </p>
                </div>
                {active && (
                  <div className="ml-auto">
                    <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">Now</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Appointment details */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pet</span>
            <span className="font-medium">{data.petName} ({data.petBreed})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service</span>
            <span className="font-medium capitalize">{data.serviceType?.replace("_", " ")}</span>
          </div>
          {data.staffName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Groomer</span>
              <span className="font-medium">{data.staffName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Booked</span>
            <span className="font-medium">
              {new Date(data.scheduledStart).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          This page updates automatically every 30 seconds. Powered by GSOS.
        </p>
      </div>
    </div>
  );
}

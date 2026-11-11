import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { IssueReportCard } from "@/components/IssueReportCard";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getActiveTimeZone } from "@/lib/timezone";
import { canAdministerStaff } from "@shared/staffAdministrators";

/**
 * The owners' inbox of staff problem reports (shared/issueReports.ts).
 * Lauren and Andy only — the server refuses everyone else too.
 */
const FILTERS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Done" },
  { key: "all", label: "All" },
] as const;

export default function IssueReports() {
  const { user } = useAuth();
  const allowed = canAdministerStaff(user ?? null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const utils = trpc.useUtils();
  const { data, isLoading, isError } = trpc.issueReports.list.useQuery(
    { filter },
    { enabled: allowed, refetchInterval: 60_000, refetchOnWindowFocus: true },
  );
  const setStatus = trpc.issueReports.setStatus.useMutation({
    onSuccess: () => {
      utils.issueReports.list.invalidate();
      utils.issueReports.openCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Could not update that report"),
  });

  // A phone notification links here with ?report=<id>.
  const highlight = Number(new URLSearchParams(window.location.search).get("report")) || null;
  useEffect(() => {
    if (!highlight || !data) return;
    document.getElementById(`report-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, data]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Problem reports</h1>
          <p className="text-sm text-muted-foreground">
            Sent by the team from the <span className="font-medium">Report a problem</span> button, with the screen they were on.
          </p>
        </div>

        {!allowed ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">Problem reports are visible to the salon owner only.</p>
        ) : (
          <>
            <div className="inline-flex rounded-lg border p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports…</p>
            ) : isError ? (
              <p className="text-sm text-destructive">Couldn't load the reports. Try refreshing.</p>
            ) : (data ?? []).length === 0 ? (
              <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                {filter === "open" ? "Nothing waiting. 🎉" : "No reports here yet."}
              </p>
            ) : (
              <div className="space-y-3">
                {data!.map((report) => (
                  <IssueReportCard
                    key={report.id}
                    report={report}
                    timeZone={getActiveTimeZone()}
                    highlighted={report.id === highlight}
                    busy={setStatus.isPending}
                    onSetStatus={(status, note) => setStatus.mutate({ id: report.id, status, note })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

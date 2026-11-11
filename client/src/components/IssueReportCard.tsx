import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ISSUE_STATUS_LABEL, isSafeAppPath, isSafeQuery, type IssueContext, type IssueRecentError, type IssueStatus,
} from "@shared/issueReports";

/**
 * One staff problem report in the owners' inbox. Plain props, no tRPC, so
 * it renders in a test without a provider (IssueReportCard.test.tsx).
 */
export type IssueReportView = {
  id: number;
  reporterName: string | null;
  message: string;
  pagePath: string | null;
  context: IssueContext;
  clientName: string | null;
  petName: string | null;
  recentErrors: IssueRecentError[];
  images: Array<{ key: string; kind: "screenshot" | "photo"; url: string }>;
  status: IssueStatus;
  resolutionNote: string | null;
  createdAt: string | Date;
};

const STATUS_TONE: Record<IssueStatus, string> = {
  new: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  fixed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  dismissed: "bg-muted text-muted-foreground",
};

export function IssueReportCard({
  report, timeZone, highlighted = false, busy = false, onSetStatus,
}: {
  report: IssueReportView;
  timeZone: string;
  highlighted?: boolean;
  busy?: boolean;
  onSetStatus: (status: IssueStatus, note?: string) => void;
}) {
  const [closing, setClosing] = useState<null | "fixed" | "dismissed">(null);
  const [note, setNote] = useState("");
  const c = report.context;
  const when = new Date(report.createdAt).toLocaleString("en-AU", {
    timeZone, weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  // Checked again here: the page came from the reporter's browser.
  const pageHref = report.pagePath && isSafeAppPath(report.pagePath)
    ? report.pagePath + (c.search && isSafeQuery(c.search) ? c.search : "")
    : null;

  return (
    <article
      id={`report-${report.id}`}
      className={`space-y-3 rounded-xl border bg-card p-4 shadow-sm ${highlighted ? "ring-2 ring-primary" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[report.status]}`}>
          {ISSUE_STATUS_LABEL[report.status]}
        </span>
        <span className="font-semibold">{report.reporterName || "Unknown"}</span>
        <span className="text-muted-foreground">{when}</span>
        <span className="ml-auto text-xs text-muted-foreground">#{report.id}</span>
      </header>

      <p className="whitespace-pre-wrap break-words text-sm">{report.message}</p>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {!pageHref && report.pagePath && <span className="rounded-md border px-2 py-1">On {report.pagePath}</span>}
        {pageHref && (
          <Link href={pageHref} className="inline-flex items-center rounded-md border px-2 py-1 hover:bg-accent">
            On {report.pagePath} <ChevronRight className="ml-0.5 h-3 w-3" />
          </Link>
        )}
        {c.clientId && (
          <Link href={`/clients/${c.clientId}`} className="inline-flex items-center rounded-md border px-2 py-1 hover:bg-accent">
            Client: {report.clientName || `#${c.clientId}`} <ChevronRight className="ml-0.5 h-3 w-3" />
          </Link>
        )}
        {c.petId && <span className="rounded-md border px-2 py-1">Dog: {report.petName || `#${c.petId}`}</span>}
        {c.appointmentId && <span className="rounded-md border px-2 py-1">Appointment #{c.appointmentId}</span>}
        {c.date && <span className="rounded-md border px-2 py-1">Day {c.date}</span>}
      </div>

      {report.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {report.images.map((img) => (
            <a
              key={img.key}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-md border bg-muted"
              title={img.kind === "screenshot" ? "Screenshot — open full size" : "Photo — open full size"}
            >
              <img
                src={img.url}
                alt={img.kind === "screenshot" ? "Screenshot of the screen" : "Attached photo"}
                className={img.kind === "screenshot" ? "h-32 w-auto max-w-[16rem] object-cover object-top" : "h-32 w-32 object-cover"}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {report.recentErrors.length > 0 && (
        <details className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">
            {report.recentErrors.length} error{report.recentErrors.length === 1 ? "" : "s"} on the page just before
          </summary>
          <ul className="mt-2 space-y-1 font-mono">
            {report.recentErrors.map((e, i) => (
              <li key={i} className="break-words">
                <span className="text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString("en-AU", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" })}
                </span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(c.viewport || c.userAgent) && (
        <p className="truncate text-[11px] text-muted-foreground" title={c.userAgent}>
          {c.viewport}{c.viewport && c.userAgent ? " · " : ""}{c.userAgent}
        </p>
      )}

      {report.resolutionNote && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs"><span className="font-semibold">Note:</span> {report.resolutionNote}</p>
      )}

      {closing ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            placeholder={closing === "fixed" ? "What was done (optional)" : "Why (optional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => { onSetStatus(closing, note.trim()); setClosing(null); setNote(""); }}>
              {closing === "fixed" ? "Mark fixed" : "Dismiss"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setClosing(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {report.status === "new" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSetStatus("in_progress")}>Working on it</Button>
          )}
          {(report.status === "new" || report.status === "in_progress") && (
            <>
              <Button size="sm" disabled={busy} onClick={() => setClosing("fixed")}>Mark fixed</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setClosing("dismissed")}>Dismiss</Button>
            </>
          )}
          {(report.status === "fixed" || report.status === "dismissed") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSetStatus("new")}>Reopen</Button>
          )}
        </div>
      )}
    </article>
  );
}

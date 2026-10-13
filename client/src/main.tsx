import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { failureNotice, shouldAnnounce } from "@shared/queryFailure";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

// Catches JS errors that happen outside React's own render cycle (e.g. a
// timer callback or event handler), which the ErrorBoundary can't see.
// __gsosReportClientError is defined in index.html's inline script, which
// runs independently of this bundle so reporting still works even if
// something here has already gone wrong.
declare global {
  interface Window {
    __gsosReportClientError?: (kind: string, extra?: Record<string, unknown>) => void;
  }
}
window.addEventListener("error", (event) => {
  window.__gsosReportClientError?.("window_error", {
    message: event.message,
    stack: event.error?.stack,
  });
});
window.addEventListener("unhandledrejection", (event) => {
  window.__gsosReportClientError?.("unhandled_rejection", {
    message: String(event.reason?.message ?? event.reason ?? "Unknown rejection"),
    stack: event.reason?.stack,
  });
});

/**
 * Keep the notification service worker up to date.
 *
 * Registered here, on every load, and not only when someone touches the
 * switch in Settings: calling register() is what makes the browser check
 * for a new sw.js, and without it a device that subscribed once would run
 * that first version forever. A bug in notification handling has to be
 * fixable the same day.
 *
 * It handles push and nothing else — no fetch handler, so it intercepts
 * no requests and cannot serve a stale bundle. Failure is ignored on
 * purpose: a browser that will not register a worker must still run the
 * salon software.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

/**
 * Make a failed request visible.
 *
 * It used to go to console.error, where nobody looks. Meanwhile 115 of the
 * app's 123 useQuery call sites never check isError, so a query that 500s
 * renders the component's empty state — "No sales in this period", "No
 * conversations yet" — and reads as a quiet day. The Net sales chart did
 * exactly that from the day it shipped.
 *
 * Two things now happen instead: the person sees one line saying the thing
 * failed rather than that it is empty, and the failure is posted to the
 * same client_error_logs table the window error handler already uses, so
 * it can be found later without anybody having mentioned it.
 */
const announcedFailures = new Map<string, number>();

const reportQueryFailure = (error: unknown, kind: "query" | "mutation") => {
  if (!(error instanceof TRPCClientError)) return;
  const data = (error as { data?: { path?: string; httpStatus?: number } }).data;
  const notice = failureNotice(
    { message: error.message, path: data?.path, httpStatus: data?.httpStatus },
    UNAUTHED_ERR_MSG,
  );
  if (!notice.report) return;
  if (!shouldAnnounce(announcedFailures, notice.key, Date.now())) return;

  toast.error(notice.message);
  // path and httpStatus fold into `message`: client_error_logs has no
  // column for them, and a row saying only "Failed query" is not something
  // anybody can act on six weeks later.
  window.__gsosReportClientError?.(`trpc_${kind}_error`, {
    message: `${data?.path ?? "unknown"} (${data?.httpStatus ?? "?"}): ${error.message}`,
  });
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    reportQueryFailure(error, "query");
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // A mutation already surfaces its own onError toast at most call
    // sites, so this is only the server-side record.
    reportQueryFailure(error, "mutation");
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

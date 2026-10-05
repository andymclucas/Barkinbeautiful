import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
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

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
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

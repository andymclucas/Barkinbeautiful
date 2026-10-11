import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Keeps every open tab in the salon current.
 *
 * The server publishes "data-changed" with the topics a mutation made stale
 * (see shared/realtimeTopics.ts); this marks the matching queries stale so
 * TanStack Query refetches the ones actually on screen. A tab showing the
 * calendar refetches the calendar; a tab showing invoices does not.
 *
 * Invalidating rather than writing the new value into the cache is deliberate.
 * The event carries topics, not rows, so nothing here has to re-implement an
 * endpoint's shape or its permissions — the tab refetches through the API it
 * already uses, as the user it already is. A groomer therefore cannot be
 * handed a row they would not have been allowed to request.
 *
 * It cannot loop: invalidation causes a query, and only mutations broadcast.
 */
export function useRealtimeInvalidation() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // EventSource reconnects on its own after a drop, with its own backoff,
    // so there is deliberately no retry logic here.
    const source = new EventSource("/api/events");

    source.onmessage = (message) => {
      let event: { type?: string; topics?: unknown };
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (event.type !== "data-changed" || !Array.isArray(event.topics)) return;
      const topics = new Set(event.topics.map(String));

      queryClient.invalidateQueries({
        // tRPC keys look like [["workflow","getTodayBoard"], {...}]. Match on
        // the router name only, so a topic covers every query under it without
        // this file having to list them.
        predicate: (query) => {
          const head = query.queryKey?.[0];
          const router = Array.isArray(head) ? head[0] : undefined;
          return typeof router === "string" && topics.has(router);
        },
        // Refetch what is on screen now; anything else refetches when it is
        // next mounted. Without this a background tab would refetch dozens of
        // queries nobody is looking at.
        refetchType: "active",
      });
    };

    // A failed stream is not worth a toast: the polling that was there before
    // is still there, so the app degrades to its old behaviour rather than
    // breaking. Logged so it is findable.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        console.warn("[realtime] event stream closed; falling back to polling");
      }
    };

    return () => source.close();
  }, [queryClient]);
}

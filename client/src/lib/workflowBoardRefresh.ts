import { useEffect, useRef, useState } from "react";
import {
  WORKFLOW_BOARD_CHECK_INTERVAL_MS,
  WORKFLOW_BOARD_FULL_REFRESH_INTERVAL_MS,
  boardVersionChanged,
} from "@shared/workflowBoardVersion";

export { WORKFLOW_BOARD_CHECK_INTERVAL_MS, WORKFLOW_BOARD_FULL_REFRESH_INTERVAL_MS };

/**
 * Shared React Query options for the controller and the independent TV display.
 *
 * The full board reloads once a minute. Changes from other screens arrive
 * sooner through the cheap fingerprint below (`workflowBoardVersionOptions`
 * plus `useReloadBoardOnChange`), so the floor still converges in seconds
 * without every screen reloading the whole day every 5 seconds — that is what
 * took TiDB past its spending limit (shared/workflowBoardVersion.ts).
 *
 * Polling only while the tab is visible avoids a persistent connection.
 */
export const workflowBoardRefreshOptions = {
  refetchInterval: WORKFLOW_BOARD_FULL_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always" as const,
};

export const workflowBoardVersionOptions = {
  refetchInterval: WORKFLOW_BOARD_CHECK_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
};

/** Reload the board when another screen changed the day. */
export function useReloadBoardOnChange(version: string | undefined, reload: () => unknown) {
  const previous = useRef<string | undefined>(undefined);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (boardVersionChanged(previous.current, version)) void reloadRef.current();
    if (version !== undefined) previous.current = version;
  }, [version]);
}

/**
 * Hold the board's live connection (/api/board-events). While it is up the
 * server tells this screen when the day changes, so the screen does not poll
 * for it; pass `!connected` as the fingerprint query's `enabled`. While it is
 * down (EventSource cannot send the Bearer fallback, a proxy dropped it, the
 * server restarted) the fingerprint polling takes over. EventSource
 * reconnects on its own, with its own backoff.
 */
export function useLiveBoard(date: string, reload: () => unknown, enabled = true): boolean {
  const [connected, setConnected] = useState(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") {
      setConnected(false);
      return;
    }
    const source = new EventSource(`/api/board-events?date=${encodeURIComponent(date)}`);
    source.onmessage = (message) => {
      let event: { type?: string };
      try { event = JSON.parse(message.data); } catch { return; }
      if (event.type === "connected") setConnected(true);
      if (event.type === "board-changed") void reloadRef.current();
    };
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      setConnected(false);
    };
  }, [date, enabled]);
  return connected;
}

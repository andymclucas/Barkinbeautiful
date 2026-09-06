export const WORKFLOW_BOARD_REFRESH_INTERVAL_MS = 5_000;

/**
 * Shared React Query options for the controller and the independent TV display.
 * Polling only while the tab is visible avoids a persistent connection and keeps
 * the autoscale deployment efficient while still converging cross-device views.
 */
export const workflowBoardRefreshOptions = {
  refetchInterval: WORKFLOW_BOARD_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always" as const,
};

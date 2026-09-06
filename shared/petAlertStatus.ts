export type ActionablePetAlertLevel = "caution" | "danger";

/**
 * Legacy pet records commonly use `ok` as a default status. It is not an
 * operational alert and must not be displayed as a pet notice on appointments.
 */
export function normalizePetAlertLevel(
  value: string | null | undefined,
): ActionablePetAlertLevel | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "danger" || normalized === "caution" ? normalized : null;
}

/**
 * The canonical list of appointment service types.
 *
 * This exists because the list drifted. `deshed` was added to the
 * `appointments.service_type` column and to most tRPC procedures, but three
 * input schemas kept the older list. The result was silent and nasty: 69 live
 * de-shed appointments could not be edited at all. Opening one in the calendar
 * and changing anything - the price, the notes, the groomer - sent
 * `serviceType: "deshed"` back, Zod rejected it, and the whole save failed with
 * a validation error that named a field the user had never touched.
 *
 * Import this everywhere a service type is validated, so the column and the
 * API can only ever disagree by someone deliberately editing both.
 */
export const SERVICE_TYPES = [
  "classic_groom",
  "styled_groom",
  "bath_only",
  "fft",
  "nail_trim",
  "daycare",
  "deshed",
  "other",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const isServiceType = (value: unknown): value is ServiceType =>
  typeof value === "string" && (SERVICE_TYPES as readonly string[]).includes(value);

/**
 * What each service is CALLED and what colour it wears.
 *
 * Lauren, 04/11/2026: "one of the girls didn't see the service was just
 * a tidy and saw the code and did a clip... So this customer just got
 * free upgrade service... ffs"
 *
 * The cause was not the styling. `WorkflowBoardTable.tsx` carried its
 * own copy of these maps keyed on `tidy` — a service type that has not
 * existed since the column was renamed to `fft`. So on the one screen
 * groomers actually work from, every FFT booking fell through to the
 * grey default and printed the raw string `fft`, while the pink it was
 * meant to wear sat in the map under a key nothing could ever match.
 * Six other copies of the same map across the app had been updated.
 *
 * These are `Record<ServiceType, ...>` on purpose. A service type with
 * no label or no colour now fails `pnpm run check` rather than quietly
 * rendering grey, and renaming one breaks the build instead of one
 * screen. That is the whole reason this lives here rather than being
 * copied an eighth time.
 */
export const SERVICE_LABEL: Record<ServiceType, string> = {
  classic_groom: "Classic Groom",
  styled_groom: "Styled Groom",
  bath_only: "Bath",
  fft: "FFT (Face, Feet & Hygiene Tidy)",
  nail_trim: "Nail Trim",
  daycare: "Daycare",
  deshed: "De-shed",
  other: "Other",
};

/**
 * The short form for a board row, where the cell is a few characters
 * wide and a groomer reads it at a glance while holding a dog.
 *
 * FFT carries "tidy only" because that is the exact fact that was
 * missed, and the one that costs money when it is: a tidy mistaken for
 * a groom is a free upgrade, and there is no way to bill it afterwards.
 */
export const SERVICE_BOARD_LABEL: Record<ServiceType, string> = {
  classic_groom: "Classic Groom",
  styled_groom: "Styled Groom",
  bath_only: "Bath",
  fft: "FFT · TIDY ONLY",
  nail_trim: "Nail Trim",
  daycare: "Daycare",
  deshed: "De-shed",
  other: "Other",
};

export const SERVICE_COLOUR: Record<ServiceType, string> = {
  classic_groom: "#22c55e",
  styled_groom: "#22c55e",
  bath_only: "#3b82f6",
  fft: "#ec4899",
  nail_trim: "#a78bfa",
  daycare: "#f59e0b",
  deshed: "#f97316",
  other: "#94a3b8",
};

/** Grey, for a row whose service predates the list or is junk. */
export const UNKNOWN_SERVICE_COLOUR = "#94a3b8";

export function serviceLabel(value: unknown): string {
  return isServiceType(value) ? SERVICE_LABEL[value] : String(value ?? "—");
}

export function serviceBoardLabel(value: unknown): string {
  return isServiceType(value) ? SERVICE_BOARD_LABEL[value] : String(value ?? "—");
}

export function serviceColour(value: unknown): string {
  return isServiceType(value) ? SERVICE_COLOUR[value] : UNKNOWN_SERVICE_COLOUR;
}

/**
 * Services that are NOT a full groom.
 *
 * Mistaking one of these for a clip is the expensive direction — the
 * work is done, the dog goes home, and the difference cannot be billed.
 * The board leans on this to decide what to shout about.
 */
export const NOT_A_FULL_GROOM: ReadonlySet<ServiceType> = new Set<ServiceType>([
  "fft", "bath_only", "nail_trim", "daycare",
]);

export function isNotAFullGroom(value: unknown): boolean {
  return isServiceType(value) && NOT_A_FULL_GROOM.has(value);
}

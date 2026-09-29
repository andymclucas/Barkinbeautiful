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

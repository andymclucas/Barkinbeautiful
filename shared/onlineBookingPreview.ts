export const PREVIEW_BOOKING_NOTE = "[PREVIEW TEST — no client messaging or automatic confirmation]";

export function buildOnlineBookingNotes(params: {
  notes?: string | null;
  sizeLabel: string;
  weightKg: number;
  preview: boolean;
}): string {
  return [
    params.preview ? PREVIEW_BOOKING_NOTE : null,
    params.notes?.trim(),
    `Online booking size: ${params.sizeLabel} (${params.weightKg}kg).`,
  ].filter(Boolean).join("\n");
}

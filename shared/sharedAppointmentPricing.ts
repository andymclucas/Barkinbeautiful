export type SharedAppointmentPriceInput = {
  petName: string | null;
  price: string | null;
};

export type SharedAppointmentPriceBreakdown = {
  petName: string;
  amount: number | null;
  formattedAmount: string | null;
  total: number | null;
  formattedTotal: string | null;
  hasUnpricedPets: boolean;
};

function parsePrice(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatAud(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function buildSharedAppointmentPriceBreakdown(appointments: SharedAppointmentPriceInput[]): SharedAppointmentPriceBreakdown[] {
  const parsed = appointments.map(appointment => ({
    petName: appointment.petName?.trim() || "Pet",
    amount: parsePrice(appointment.price),
  }));
  const hasUnpricedPets = parsed.some(entry => entry.amount === null);
  const total = hasUnpricedPets ? null : parsed.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);

  return parsed.map(entry => ({
    petName: entry.petName,
    amount: entry.amount,
    formattedAmount: entry.amount === null ? null : formatAud(entry.amount),
    total,
    formattedTotal: total === null ? null : formatAud(total),
    hasUnpricedPets,
  }));
}

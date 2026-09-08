export const PRICING_CATALOGUE_TYPES = ["service", "add_on"] as const;

export type PricingCatalogueType = (typeof PRICING_CATALOGUE_TYPES)[number];

export function normalisePricingCode(value: string): string {
  const code = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(code)) {
    throw new Error("Use a unique code with letters, numbers, hyphens or underscores.");
  }
  return code;
}

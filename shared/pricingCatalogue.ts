export const PRICING_CATALOGUE_TYPES = ["service", "add_on"] as const;
export const PRICING_PRICE_MODES = ["fixed", "range", "from", "quote"] as const;

export type PricingCatalogueType = (typeof PRICING_CATALOGUE_TYPES)[number];
export type PricingPriceMode = (typeof PRICING_PRICE_MODES)[number];

export function normalisePricingCode(value: string): string {
  const code = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(code)) {
    throw new Error("Use a unique code with letters, numbers, hyphens or underscores.");
  }
  return code;
}

export function getPricingAmountValidationError(input: { priceMode: PricingPriceMode; priceAud?: number; priceMaxAud?: number }): string | null {
  if (input.priceMode === "quote") {
    return input.priceAud !== undefined || input.priceMaxAud !== undefined ? "Quote-required services cannot include a fixed price" : null;
  }
  if (input.priceAud === undefined) return "Enter a base price for this catalogue item";
  if (input.priceMode === "range") {
    return input.priceMaxAud === undefined || input.priceMaxAud < input.priceAud ? "Enter a maximum price that is not lower than the base price" : null;
  }
  return input.priceMaxAud !== undefined ? "Only price ranges can include a maximum price" : null;
}

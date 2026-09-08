import mysql from "mysql2/promise";

export const APPROVED_PRICE_LIST_SOURCE = "Barkin Beautiful 2025 financial-year price list";
export const APPROVED_PRICE_LIST_URL = "https://barkinbeautiful.com.au/wp-content/uploads/2025/04/PRICE-LIST-2024-2025-Finacial-Year-Price-List.pdf";

const fixed = (code, name, priceAud, weightBand, legacyServiceType, sortOrder, description = null) => ({
  catalogueType: "service", code, name, priceMode: "fixed", priceAud, priceMaxAud: null, durationMinutes: null, weightBand, legacyServiceType, sortOrder, description,
});
const range = (code, name, priceAud, priceMaxAud, weightBand, legacyServiceType, sortOrder, description = null) => ({
  catalogueType: "service", code, name, priceMode: "range", priceAud, priceMaxAud, durationMinutes: null, weightBand, legacyServiceType, sortOrder, description,
});
const from = (code, name, priceAud, weightBand, legacyServiceType, sortOrder, description = null) => ({
  catalogueType: "service", code, name, priceMode: "from", priceAud, priceMaxAud: null, durationMinutes: null, weightBand, legacyServiceType, sortOrder, description,
});
const quote = (code, name, weightBand, legacyServiceType, sortOrder, description = null) => ({
  catalogueType: "service", code, name, priceMode: "quote", priceAud: null, priceMaxAud: null, durationMinutes: null, weightBand, legacyServiceType, sortOrder, description,
});
const addOn = (code, name, priceMode, priceAud, sortOrder, description = null) => ({
  catalogueType: "add_on", code, name, priceMode, priceAud, priceMaxAud: null, durationMinutes: null, weightBand: null, legacyServiceType: null, sortOrder, description,
});

export const APPROVED_PRICING_SERVICES = [
  fixed("bath-towel-small-short", "Bath & towel-dry", 40, "Small (up to 10 kg), short coat under 1 cm", "bath_only", 10),
  fixed("bath-towel-small-long", "Bath & towel-dry", 50, "Small (up to 10 kg), coat over 1 inch", "bath_only", 11),
  fixed("bath-blow-small-short", "Bath & blow-dry", 50, "Small (up to 10 kg), short coat under 1 cm", "bath_only", 12),
  fixed("bath-blow-small-long", "Bath & blow-dry", 60, "Small (up to 10 kg), coat over 1 inch", "bath_only", 13),
  fixed("hygiene-small-short", "Hygiene groom", 80, "Small (up to 10 kg), short coat under 1 cm", "fft", 14),
  fixed("hygiene-small-long", "Hygiene groom", 110, "Small (up to 10 kg), coat over 1 inch", "fft", 15),
  fixed("deshed-small", "De-shed", 100, "Small (up to 10 kg)", "deshed", 16, "A$100 per hour. Estimated 0.5–1 hour for short coats and 1.5 hours for coats over 1 inch."),
  fixed("classic-small", "Classic clip (blade)", 100, "Small (up to 10 kg)", "classic_groom", 17),
  fixed("styled-small", "Style cut (comb)", 130, "Small (up to 10 kg)", "styled_groom", 18),

  fixed("bath-towel-medium-short", "Bath & towel-dry", 45, "Medium (12–16 kg), short coat under 1 cm", "bath_only", 20),
  fixed("bath-towel-medium-long", "Bath & towel-dry", 55, "Medium (12–16 kg), coat over 1 inch", "bath_only", 21),
  fixed("bath-blow-medium-short", "Bath & blow-dry", 60, "Medium (12–16 kg), short coat under 1 cm", "bath_only", 22),
  fixed("bath-blow-medium-long", "Bath & blow-dry", 80, "Medium (12–16 kg), coat over 1 inch", "bath_only", 23),
  fixed("hygiene-medium-short", "Hygiene groom", 100, "Medium (12–16 kg), short coat under 1 cm", "fft", 24),
  fixed("hygiene-medium-long", "Hygiene groom", 130, "Medium (12–16 kg), coat over 1 inch", "fft", 25),
  fixed("deshed-medium", "De-shed", 100, "Medium (12–16 kg)", "deshed", 26, "A$100 per hour. Estimated 2 hours for short coats and 2.5 hours for coats over 1 inch."),
  fixed("classic-medium", "Classic clip (blade)", 140, "Medium (12–16 kg)", "classic_groom", 27),
  fixed("styled-medium", "Style cut (comb)", 190, "Medium (12–16 kg)", "styled_groom", 28),

  fixed("bath-towel-large-short", "Bath & towel-dry", 60, "Large (16–26 kg), short coat under 1 cm", "bath_only", 30),
  fixed("bath-towel-large-long", "Bath & towel-dry", 70, "Large (16–26 kg), coat over 1 inch", "bath_only", 31),
  fixed("bath-blow-large-short", "Bath & blow-dry", 80, "Large (16–26 kg), short coat under 1 cm", "bath_only", 32),
  fixed("bath-blow-large-long", "Bath & blow-dry", 90, "Large (16–26 kg), coat over 1 inch", "bath_only", 33),
  fixed("hygiene-large-short", "Hygiene groom", 140, "Large (16–26 kg), short coat under 1 cm", "fft", 34),
  fixed("hygiene-large-long", "Hygiene groom", 160, "Large (16–26 kg), coat over 1 inch", "fft", 35),
  fixed("deshed-large", "De-shed", 100, "Large (16–26 kg)", "deshed", 36, "A$100 per hour. Estimated 2.5 hours for short coats and 3 hours or more for coats over 1 inch."),
  range("classic-large", "Classic clip (blade)", 180, 200, "Large (16–26 kg)", "classic_groom", 37),
  from("styled-large", "Style cut (comb)", 230, "Large (16–26 kg)", "styled_groom", 38),

  fixed("bath-towel-xlarge-short", "Bath & towel-dry", 70, "Extra Large (26–36 kg), short coat under 1 cm", "bath_only", 40),
  fixed("bath-towel-xlarge-long", "Bath & towel-dry", 80, "Extra Large (26–36 kg), coat over 1 inch", "bath_only", 41),
  from("bath-blow-xlarge-short", "Bath & blow-dry", 90, "Extra Large (26–36 kg), short coat under 1 cm", "bath_only", 42),
  from("bath-blow-xlarge-long", "Bath & blow-dry", 100, "Extra Large (26–36 kg), coat over 1 inch", "bath_only", 43),
  from("hygiene-xlarge-short", "Hygiene groom", 140, "Extra Large (26–36 kg), short coat under 1 cm", "fft", 44),
  quote("hygiene-xlarge-long", "Hygiene groom", "Extra Large (26–36 kg), coat over 1 inch", "fft", 45, "Price on application."),
  quote("deshed-xlarge", "De-shed", "Extra Large (26–36 kg)", "deshed", 46, "Price on application."),
  from("classic-xlarge", "Classic clip", 200, "Extra Large (26–36 kg)", "classic_groom", 47),
  from("styled-xlarge", "Style cut", 250, "Extra Large (26–36 kg)", "styled_groom", 48),

  addOn("styled-traditional-or-dematted", "Styled, traditional or de-matting work", "from", 30, 100, "Styled, teddy bear and traditional breed clips, matting and de-matting. Conditions apply."),
  addOn("two-groomer-assist", "Two-groomer assist", "from", 30, 101, "For older dogs and biting or difficult dogs."),
  addOn("flea-rinse", "Flea rinse", "from", 30, 102),
  addOn("anal-glands", "Anal glands", "fixed", 30, 103),
  addOn("nail-polish-or-pet-colouring", "Nail polish or pet colouring", "quote", null, 104, "Price on application."),
  addOn("nails-clipped-and-filed", "Nails clipped and filed", "fixed", 20, 105),
];

const WEIGHT_BANDS = [
  ["small", "Small (0–10 kg)"],
  ["small_medium", "Small-Medium (11–13 kg)"],
  ["medium", "Medium (14–16 kg)"],
  ["large", "Large (17–25 kg)"],
  ["extra_large", "Extra Large (26–34 kg)"],
  ["giant", "Giant (36–80 kg)"],
];
const PACKAGE_PRICES = {
  diamond: { classic: [52, 62, 70, 82, 92, 105] },
  platinum: { classic: [40, 50, 59, 70, 82, 95] },
  gold: { classic: [22, 26, 32, 35, 44, 47], styled: [26, 30, 36, 39, 48, 51] },
  silver: { classic: [17, 22, 27, 31, 40, 44], styled: [22, 28, 31, 36, 45, 50] },
  bronze: { classic: [15, 19, 24, 27, 30, 34], styled: [19, 23, 28, 31, 34, 38] },
};
const PLAN_INTERVALS = { diamond: 2, platinum: 3, gold: 4, silver: 6, bronze: 8 };

export const APPROVED_MEMBERSHIP_PLANS = WEIGHT_BANDS.flatMap(([weightClass, weightBand], weightIndex) =>
  Object.entries(PACKAGE_PRICES).flatMap(([tier, variants], tierIndex) =>
    Object.entries(variants).map(([serviceVariant, prices], variantIndex) => ({
      code: `${tier}-${serviceVariant}-${weightClass}`,
      name: `${tier[0].toUpperCase()}${tier.slice(1)} VIP${tier === "diamond" || tier === "platinum" ? "" : ` ${serviceVariant[0].toUpperCase()}${serviceVariant.slice(1)}`} - ${weightBand}`,
      tier: `${tier[0].toUpperCase()}${tier.slice(1)}`,
      serviceVariant: `${serviceVariant[0].toUpperCase()}${serviceVariant.slice(1)}`,
      weightBand,
      weeklyPriceAud: prices[weightIndex],
      billingCycleWeeks: 1,
      appointmentIntervalWeeks: PLAN_INTERVALS[tier],
      description: `Verified VIP plan. Weekly direct debit with a 12-month minimum term. Scheduled every ${PLAN_INTERVALS[tier]} weeks.`,
      sortOrder: tierIndex * 100 + variantIndex * 10 + weightIndex,
    })),
  ),
);

function connectionOptions() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required and was not found");
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 4000),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  };
}

async function populate() {
  const connection = await mysql.createConnection(connectionOptions());
  try {
    const serviceValues = APPROVED_PRICING_SERVICES.map((item) => [1, item.catalogueType, item.name, item.code, item.description, item.priceMode, item.priceAud, item.priceMaxAud, item.durationMinutes, item.legacyServiceType, item.weightBand, 1, item.sortOrder]);
    const [serviceResult] = await connection.query(
      "INSERT IGNORE INTO pricing_services (tenant_id, catalogue_type, name, code, description, price_mode, price_aud, price_max_aud, duration_minutes, legacy_service_type, weight_band, is_active, sort_order) VALUES ?",
      [serviceValues],
    );
    const planValues = APPROVED_MEMBERSHIP_PLANS.map((item) => [1, item.name, item.code, item.tier, item.serviceVariant, item.weightBand, item.weeklyPriceAud, item.billingCycleWeeks, item.appointmentIntervalWeeks, item.description, 1, item.sortOrder]);
    const [planResult] = await connection.query(
      "INSERT IGNORE INTO membership_plans (tenant_id, name, code, tier, service_variant, weight_band, weekly_price_aud, billing_cycle_weeks, appointment_interval_weeks, description, is_active, sort_order) VALUES ?",
      [planValues],
    );
    const [[serviceCount]] = await connection.query("SELECT COUNT(*) AS count FROM pricing_services WHERE tenant_id = 1");
    const [[planCount]] = await connection.query("SELECT COUNT(*) AS count FROM membership_plans WHERE tenant_id = 1");
    console.log(JSON.stringify({ source: APPROVED_PRICE_LIST_SOURCE, serviceRowsInserted: serviceResult.affectedRows, membershipPlanRowsInserted: planResult.affectedRows, pricingServicesForTenant: serviceCount.count, membershipPlansForTenant: planCount.count }, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv.includes("--apply")) {
  populate().catch((error) => {
    console.error(error instanceof Error ? error.message : "Catalogue population failed");
    process.exitCode = 1;
  });
} else {
  console.log(JSON.stringify({ source: APPROVED_PRICE_LIST_SOURCE, pricingServiceCount: APPROVED_PRICING_SERVICES.length, membershipPlanCount: APPROVED_MEMBERSHIP_PLANS.length, apply: false }, null, 2));
}

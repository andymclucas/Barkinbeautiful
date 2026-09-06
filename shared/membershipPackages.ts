export type MembershipTier = "diamond" | "platinum" | "gold" | "silver" | "bronze";
export type MembershipService = "classic" | "styled";
export type MembershipWeightClass = "small" | "small_medium" | "medium" | "large" | "extra_large" | "giant";

export type MembershipWeightBand = {
  id: MembershipWeightClass;
  label: string;
  minKg: number;
  maxKg: number;
};

export type MembershipPackage = {
  id: string;
  name: string;
  tier: MembershipTier;
  serviceType: MembershipService;
  weightClass: MembershipWeightClass;
  weeklyPrice: number;
  appointmentIntervalWeeks: number;
  visitsPerYear: string;
};

export const MEMBERSHIP_WEIGHT_BANDS: MembershipWeightBand[] = [
  { id: "small", label: "Small (0–10 kg)", minKg: 0, maxKg: 10 },
  { id: "small_medium", label: "Small-Medium (11–13 kg)", minKg: 11, maxKg: 13 },
  { id: "medium", label: "Medium (14–16 kg)", minKg: 14, maxKg: 16 },
  { id: "large", label: "Large (17–25 kg)", minKg: 17, maxKg: 25 },
  { id: "extra_large", label: "Extra Large (26–34 kg)", minKg: 26, maxKg: 34 },
  { id: "giant", label: "Giant (36–80 kg)", minKg: 36, maxKg: 80 },
];

const WEIGHT_LABEL_BY_CLASS = new Map(MEMBERSHIP_WEIGHT_BANDS.map((band) => [band.id, band.label]));

const PACKAGE_PRICES: Record<MembershipTier, Partial<Record<MembershipService, readonly number[]>>> = {
  diamond: { classic: [52, 62, 70, 82, 92, 105] },
  platinum: { classic: [40, 50, 59, 70, 82, 95] },
  gold: { classic: [22, 26, 32, 35, 44, 47], styled: [26, 30, 36, 39, 48, 51] },
  silver: { classic: [17, 22, 27, 31, 40, 44], styled: [22, 28, 31, 36, 45, 50] },
  bronze: { classic: [15, 19, 24, 27, 30, 34], styled: [19, 23, 28, 31, 34, 38] },
};

const PACKAGE_SCHEDULE: Record<MembershipTier, { appointmentIntervalWeeks: number; visitsPerYear: string }> = {
  diamond: { appointmentIntervalWeeks: 2, visitsPerYear: "20 visits per year" },
  platinum: { appointmentIntervalWeeks: 3, visitsPerYear: "17 visits per year" },
  gold: { appointmentIntervalWeeks: 4, visitsPerYear: "13 visits per year" },
  silver: { appointmentIntervalWeeks: 6, visitsPerYear: "8–9 visits per year" },
  bronze: { appointmentIntervalWeeks: 8, visitsPerYear: "6–7 visits per year" },
};

function packageName(tier: MembershipTier, serviceType: MembershipService, weightClass: MembershipWeightClass) {
  const title = `${tier.charAt(0).toUpperCase()}${tier.slice(1)} VIP`;
  const serviceSuffix = tier === "diamond" || tier === "platinum" ? "" : ` ${serviceType === "styled" ? "Styled" : "Classic"}`;
  return `${title}${serviceSuffix} - ${WEIGHT_LABEL_BY_CLASS.get(weightClass)}`;
}

export const MEMBERSHIP_PACKAGES: MembershipPackage[] = MEMBERSHIP_WEIGHT_BANDS.flatMap((weightBand, weightIndex) =>
  (Object.entries(PACKAGE_PRICES) as Array<[MembershipTier, Partial<Record<MembershipService, readonly number[]>>]>).flatMap(([tier, services]) =>
    (Object.entries(services) as Array<[MembershipService, readonly number[]]>).map(([serviceType, prices]) => ({
      id: `${tier}-${serviceType}-${weightBand.id}`,
      name: packageName(tier, serviceType, weightBand.id),
      tier,
      serviceType,
      weightClass: weightBand.id,
      weeklyPrice: prices[weightIndex]!,
      appointmentIntervalWeeks: PACKAGE_SCHEDULE[tier].appointmentIntervalWeeks,
      visitsPerYear: PACKAGE_SCHEDULE[tier].visitsPerYear,
    })),
  ),
);

export function getMembershipWeightBand(weight: string | number | null | undefined): MembershipWeightBand | null {
  if (weight === null || weight === undefined || weight === "") return null;
  const value = typeof weight === "number" ? weight : Number(weight);
  if (!Number.isFinite(value)) return null;
  return MEMBERSHIP_WEIGHT_BANDS.find((band) => value >= band.minKg && value <= band.maxKg) ?? null;
}

export function getMembershipPackagesForWeight(weight: string | number | null | undefined): MembershipPackage[] {
  const weightBand = getMembershipWeightBand(weight);
  return weightBand ? MEMBERSHIP_PACKAGES.filter((membershipPackage) => membershipPackage.weightClass === weightBand.id) : [];
}

export function getMembershipPackagesForTierAndWeightClass(tier: MembershipTier, weightClass: MembershipWeightClass): MembershipPackage[] {
  return MEMBERSHIP_PACKAGES.filter((membershipPackage) => membershipPackage.tier === tier && membershipPackage.weightClass === weightClass);
}

export function getMembershipPackageById(packageId: string): MembershipPackage | null {
  return MEMBERSHIP_PACKAGES.find((membershipPackage) => membershipPackage.id === packageId) ?? null;
}

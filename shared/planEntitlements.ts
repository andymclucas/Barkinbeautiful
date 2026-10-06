/**
 * What a salon has paid for.
 *
 * Groomigo is sold in three stages, and the stages are the product:
 *
 *   1. The software      — booking, staff, analytics and reporting
 *   2. + Messaging       — SMS and email to clients, and moving those
 *                          clients onto a membership (subscription) model
 *   3. + Workflow        — the board that walks a dog through bathing,
 *                          drying and grooming. The main upsell, because
 *                          nothing else in dog grooming does it.
 *
 * The tenants table has carried `subscription_plan` and
 * `subscription_status` since the beginning and NOTHING has ever read
 * them. These are the rules that make them mean something.
 *
 * Pure, and tested, because the failure modes are commercial in both
 * directions: gate too much and a paying salon loses the board mid-groom;
 * gate too little and the upsell that the business depends on is free.
 */

export const PLANS = ["trial", "starter", "professional", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The sellable capabilities. `core` is everything stage one buys and is
 * never gated — a salon that stops paying still needs to open its diary
 * and get its own data out.
 */
export const FEATURES = ["core", "messaging", "memberships", "workflow"] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * Stage to plan. The enum predates the three stages, so they are mapped
 * rather than renamed — renaming an enum in MySQL rewrites the column on
 * a live table, and the names are only ever seen by us.
 *
 * `trial` gets everything on purpose. A salon evaluating Groomigo should
 * see the workflow board, because that is the thing they will not find
 * anywhere else and the reason they will pay for stage three.
 */
export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  trial:        ["core", "messaging", "memberships", "workflow"],
  starter:      ["core"],
  professional: ["core", "messaging", "memberships"],
  enterprise:   ["core", "messaging", "memberships", "workflow"],
};

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Trial",
  starter: "Software",
  professional: "Software + Messaging",
  enterprise: "Complete, with Workflow",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  core: "Booking, staff and reporting",
  messaging: "Client messaging",
  memberships: "Memberships and subscriptions",
  workflow: "Workflow board and pet tracker",
};

/**
 * What a lapsed subscription still gets.
 *
 * Deliberately not nothing. A salon whose card failed is mid-service with
 * real dogs in the building; taking the diary away is a disaster for them
 * and a reputational one for us. `past_due` keeps everything and is
 * chased out of band — the card being declined is not the groomer's
 * fault and not the dog's.
 *
 * `cancelled` drops to core so the salon can still open the diary, read
 * its history and export, which is the decent floor for data that is
 * theirs.
 */
export function effectivePlan(plan: Plan, status: SubscriptionStatus): readonly Feature[] {
  if (status === "cancelled") return ["core"];
  return PLAN_FEATURES[plan] ?? ["core"];
}

export function hasFeature(
  plan: Plan | string | null | undefined,
  status: SubscriptionStatus | string | null | undefined,
  feature: Feature,
): boolean {
  // An unrecognised plan or status is treated as the fullest reading, not
  // the emptiest. A typo in a column, or an enum value added later and
  // not mapped here, must never be the reason a salon's board goes dark
  // in the middle of a Saturday.
  const p = (PLANS as readonly string[]).includes(plan as string) ? (plan as Plan) : null;
  const s = (SUBSCRIPTION_STATUSES as readonly string[]).includes(status as string) ? (status as SubscriptionStatus) : null;
  if (p === null) return true;
  if (feature === "core") return true;
  return effectivePlan(p, s ?? "active").includes(feature);
}

/** What to say when a salon reaches for something they have not bought. */
export function upgradeMessage(feature: Feature): string {
  if (feature === "workflow") {
    return "The workflow board is part of the Complete plan. It walks every dog through bathing, drying and grooming, and shows the salon who is where at a glance.";
  }
  if (feature === "messaging") {
    return "Client messaging is part of the Messaging plan — reminders, pickup texts and campaigns to your clients.";
  }
  if (feature === "memberships") {
    return "Memberships are part of the Messaging plan — move your regulars onto a weekly subscription instead of paying per groom.";
  }
  return "That is not included in your current plan.";
}

/** The smallest plan that includes a feature, for an upgrade prompt. */
export function smallestPlanWith(feature: Feature): Plan {
  const order: Plan[] = ["starter", "professional", "enterprise"];
  return order.find(p => PLAN_FEATURES[p].includes(feature)) ?? "enterprise";
}

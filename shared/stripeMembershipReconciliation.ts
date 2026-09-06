export type StripeReconciliationCounts = {
  activeMemberships: number;
  moegoLinkedMemberships: number;
  stripeMappedSubscriptions: number;
  stripeMappedCustomers: number;
};

export function getStripePrototypeStatus(
  mode: "prototype" | "live" | null | undefined,
  connectedAt: Date | string | null | undefined,
  counts: StripeReconciliationCounts,
) {
  const prototype = mode !== "live";
  const unmappedMemberships = Math.max(0, counts.activeMemberships - counts.stripeMappedSubscriptions);
  return {
    prototype,
    connectionLabel: connectedAt ? "Stripe account connected" : "Stripe account connection required",
    safetyMessage: prototype
      ? "Prototype mode is on. Groomigo will not create customer charges or subscriptions."
      : "Live Stripe billing is enabled for authorised membership workflows.",
    unmappedMemberships,
  };
}

/**
 * Whether a client can use their portal, in two words and a reason.
 *
 * Andy, 04/11/2026: "at a glance on the overview - show if the client has
 * setup and has access to their client portal 'Yes/No'". It went in as the
 * ninth tile on the overview, below the fold of the counts.
 *
 * Lauren, 19/11/2026: "need to move Portal access up the top near their
 * name". So the same answer now sits beside the name, and this is the one
 * place that decides what it says.
 *
 * A setup link that was sent and never used is not access (the client
 * cannot sign in), so it reads No with the reason, not a third state.
 */
export type PortalAccountGlance = {
  portalAccountStatus?: string | null;
  portalLastSignedInAt?: Date | string | null;
  setupExpired?: boolean | null;
};

export function portalAccessSummary(
  portal: PortalAccountGlance | null | undefined,
  formatDay: (when: Date | string) => string,
): { hasAccess: boolean; label: "Yes" | "No"; detail: string } {
  if (portal?.portalAccountStatus === "active") {
    return {
      hasAccess: true,
      label: "Yes",
      detail: portal.portalLastSignedInAt ? `last used ${formatDay(portal.portalLastSignedInAt)}` : "never signed in",
    };
  }
  const detail = portal?.setupExpired
    ? "setup link expired"
    : portal?.portalAccountStatus === "setup_pending"
      ? "setup sent, not used"
      : portal?.portalAccountStatus === "revoked"
        ? "access revoked"
        : "not set up";
  return { hasAccess: false, label: "No", detail };
}

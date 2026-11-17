/**
 * Which tab the Settings page should open on, from the address.
 *
 * Settings opened on "Salon" whatever the link said. The trial banner's
 * "Choose a plan" button and Stripe's return from Checkout both sent an
 * owner to /settings, where the bill is one tab over and nothing on
 * screen says so — and for a salon whose trial has ended, the Salon tab
 * is a page of refused requests. The subscription card also only mounts
 * with its tab, so the "Stripe has your card" confirmation it shows on
 * return never appeared.
 *
 * `?tab=billing` names a tab outright. `?billing=started|cancelled` is
 * what Stripe's return URL carries, and means the Billing tab too.
 */
export const SETTINGS_TABS = [
  "salon", "billing", "branding", "timing", "notifications", "integrations", "security",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "salon";

/** The address a link should use to open Settings on a given tab. */
export function settingsTabHref(tab: SettingsTab): string {
  return tab === DEFAULT_SETTINGS_TAB ? "/settings" : `/settings?tab=${tab}`;
}

/**
 * The tab the address asks for, or null when it asks for none.
 *
 * Null rather than the default, so a page that is already open can tell
 * "the address changed to name a tab" from "the address has nothing to
 * say" and leave the tab somebody clicked alone.
 */
export function requestedSettingsTab(search: string | null | undefined): SettingsTab | null {
  const params = new URLSearchParams((search ?? "").replace(/^\?/, ""));
  const named = params.get("tab");
  if (named !== null && (SETTINGS_TABS as readonly string[]).includes(named)) {
    return named as SettingsTab;
  }
  // Stripe's return from Checkout. Any value: the card reads which.
  if (params.get("billing")) return "billing";
  return null;
}

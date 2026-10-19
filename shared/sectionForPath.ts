/**
 * Which permission a tRPC call needs, worked out from its path.
 *
 * One map, checked in one middleware, rather than a guard remembered in
 * each of ~330 procedures. A guard that has to be remembered is a guard
 * that gets forgotten, and the one that gets forgotten is the one that
 * matters — `requireSection` already existed in this codebase and had
 * ZERO call sites, so every tick box on the staff rights screen
 * controlled nothing but which sidebar links appeared.
 *
 * ## Only mutations
 *
 * Reading is governed by the procedure types in server/_core/trpc.ts.
 * This answers "may they CHANGE this", which is what the tick boxes say.
 *
 * ## Default is ungated
 *
 * A namespace missing from this map is not gated. That is deliberate:
 * the alternative is that adding a router silently locks out the salon
 * until someone notices. The pinning test lists every namespace so a new
 * one has to be classified on purpose rather than by omission.
 */

import type { StaffSection } from "./staffPermissions";

/** Namespace → the section that may change it. */
export const SECTION_BY_NAMESPACE: Readonly<Record<string, StaffSection>> = {
  calendar: "appointments",
  appointmentAddOns: "appointments",
  bookingPricing: "appointments",
  waitlist: "appointments",

  workflow: "workflow",
  workflowReview: "workflow",
  tracker: "workflow",

  clients: "clients",
  pets: "clients",
  agreements: "clients",
  clientReviews: "clients",
  petPaperwork: "clients",
  clientNotes: "clients",
  groomNotes: "clients",
  groomingReports: "clients",
  clientPhotos: "clients",
  family: "clients",

  memberships: "memberships",
  packages: "memberships",
  membershipSignup: "memberships",

  pricing: "pricing",
  groomStylePresets: "pricing",
  retail: "pricing",
  storeCredit: "pricing",

  staff: "staff",
  revenueTargets: "revenue_targets",

  sms: "messages",
  portalChat: "messages",
  clientPortal: "messages",
  campaigns: "email_campaigns",
};

/**
 * Calls that stay open to everyone with an account, whatever their grant.
 *
 * Each one is here for a reason, not for convenience:
 *
 * `clients.create` — whoever answers the phone adds the client, bathers
 * included. Gating it would mean either giving bathers the right to
 * rewrite every client record or telling a customer to call back.
 *
 * `staff.updateMyProfile` — editing your OWN details is not an
 * administrative act and never was; the staff section is about changing
 * somebody else's.
 *
 * `auth.*` and `pushSubscriptions.*` — signing in and registering a
 * device cannot depend on a permission, or a locked-out person could not
 * sign in to find out they are locked out.
 */
export const UNGATED_PATHS: readonly string[] = [
  "clients.create",
  "staff.updateMyProfile",
  "staff.acceptInvite",
  "staff.requestAccess",
];

export const UNGATED_NAMESPACES: readonly string[] = [
  "auth",
  "pushSubscriptions",
  "trial",
  "salonSignup",
  "sidebarCounts",
  "system",
];

/**
 * The section a mutation needs, or null when it is not section-gated.
 *
 * Null covers three cases that all mean "do not check here": an ungated
 * path, a namespace nobody has classified, and the admin-only corners
 * (settings, migration, billing) where `adminProcedure` is already the
 * gate and a second one would only add a way to be wrong.
 */
export function sectionForPath(path: string): StaffSection | null {
  if (UNGATED_PATHS.includes(path)) return null;
  const namespace = path.split(".")[0] ?? "";
  if (UNGATED_NAMESPACES.includes(namespace)) return null;
  return SECTION_BY_NAMESPACE[namespace] ?? null;
}

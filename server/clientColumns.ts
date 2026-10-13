import { clients } from "../drizzle/schema";

/**
 * Every client column EXCEPT the secrets.
 *
 * `select()` with no argument returns the whole row, and `clients` carries
 * `portal_password_hash` and `portal_setup_token_hash`. Both were being
 * sent to the browser on every page of the client list and on every client
 * profile — nothing in the UI reads them, so it was pure leakage, and the
 * setup-token hash is the thing that gates taking over a client's portal
 * account.
 *
 * Found on 13/10/2026 while opening the list to salon staff, which would
 * have widened it from two owners to every groomer. Listing the columns
 * explicitly is what stops the next column with a secret in it from
 * joining the payload by default.
 */
export const CLIENT_PUBLIC_COLUMNS = {
  id: clients.id,
  tenantId: clients.tenantId,
  firstName: clients.firstName,
  lastName: clients.lastName,
  email: clients.email,
  phone: clients.phone,
  address: clients.address,
  notes: clients.notes,
  status: clients.status,
  referralSource: clients.referralSource,
  smsOptedOutAt: clients.smsOptedOutAt,
  portalLoginEmail: clients.portalLoginEmail,
  portalAccountStatus: clients.portalAccountStatus,
  portalSetupExpiresAt: clients.portalSetupExpiresAt,
  portalLastSignedInAt: clients.portalLastSignedInAt,
  moegoClientId: clients.moegoClientId,
  moegoTags: clients.moegoTags,
  moegoNotes: clients.moegoNotes,
  stripeCustomerId: clients.stripeCustomerId,
  stripeDefaultPaymentMethodId: clients.stripeDefaultPaymentMethodId,
  stripeCardBrand: clients.stripeCardBrand,
  stripeCardLast4: clients.stripeCardLast4,
  stripeCardExpMonth: clients.stripeCardExpMonth,
  stripeCardExpYear: clients.stripeCardExpYear,
  stripeCardSavedAt: clients.stripeCardSavedAt,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
} as const;


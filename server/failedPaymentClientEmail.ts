/**
 * The one place a client is emailed about a failed membership payment.
 *
 * Andy, 25/11/2026: "Add in a portal notification to the client first
 * about the failed payment. Second day with fail attempt is an email to
 * the client. 3rd is suspended."
 *
 * Three paths record a failure: Stripe's own invoice.payment_failed
 * webhook, the 9 am retry job and staff pressing Record Failure. Each
 * used to decide for itself whether the client heard anything, and they
 * disagreed: the webhook never emailed the client at all, even when it
 * suspended them. All three now ask `clientFailureNotice` and send
 * through here.
 *
 * The first failure sends nothing from here. The portal shows that one,
 * read from the membership's own failure count (clientPortal
 * getMyPaymentMethod), so there is nothing to send and nothing to repeat.
 */
import { and, eq } from "drizzle-orm";
import { clients, tenants } from "../drizzle/schema";
import type { ClientFailureNotice } from "@shared/stripeBilling";
import type { MembershipBillingCycle } from "@shared/membershipBillingCycle";
import { clientSalonName } from "@shared/salonBrand";
import { getPortalBaseUrl } from "./appUrl";
import { buildClientFailedPaymentEmail, buildClientPaymentRetryEmail, sendEmail } from "./email";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function emailClientAboutFailedPayment(
  db: Db,
  input: {
    tenantId: number;
    clientId: number | null;
    notice: ClientFailureNotice;
    petName: string;
    membershipName: string;
    pricePerCycle: string;
    billingCycle?: MembershipBillingCycle | null;
    retryAt: Date | null;
  },
): Promise<"sent" | "portal_only" | "no_email" | "failed"> {
  if (input.notice === "portal") return "portal_only";
  if (!input.clientId) return "no_email";

  const [client] = await db
    .select({ firstName: clients.firstName, email: clients.email })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, input.tenantId)))
    .limit(1);
  if (!client?.email) return "no_email";

  const [tenant] = await db
    .select({ name: tenants.name, phone: tenants.phone, email: tenants.email })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);
  const businessName = clientSalonName(tenant?.name);
  const firstName = client.firstName ?? "there";
  const cycle = input.billingCycle ?? undefined;

  if (input.notice === "retry_email") {
    const retryDate = input.retryAt
      ? input.retryAt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane" })
      : "the next business day";
    const ok = await sendEmail({
      to: client.email,
      subject: `Your ${input.membershipName} payment didn't go through`,
      html: buildClientPaymentRetryEmail({
        clientFirstName: firstName,
        petName: input.petName,
        membershipName: input.membershipName,
        pricePerCycle: input.pricePerCycle,
        billingCycle: cycle,
        retryDate,
        portalUrl: `${getPortalBaseUrl()}/portal/login`,
        businessName,
        businessPhone: tenant?.phone,
        businessEmail: tenant?.email,
      }),
    }).catch(() => false);
    return ok ? "sent" : "failed";
  }

  const ok = await sendEmail({
    to: client.email,
    subject: `Important: Your ${input.membershipName} payment has failed`,
    html: buildClientFailedPaymentEmail({
      clientFirstName: firstName,
      petName: input.petName,
      membershipName: input.membershipName,
      pricePerCycle: input.pricePerCycle,
      billingCycle: cycle,
      businessName,
      businessPhone: tenant?.phone,
      businessEmail: tenant?.email,
    }),
  }).catch(() => false);
  return ok ? "sent" : "failed";
}

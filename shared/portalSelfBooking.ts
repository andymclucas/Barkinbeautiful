/**
 * What a client may book for one of their own dogs from the portal.
 *
 * Andy, 24/11/2026: "Add in live booking system and adding add-on services
 * for clients to do themselves within the client portal." And on members:
 * "Members can book only what their membership covers. It will
 * automatically default to the service that is included in their
 * membership. If they require anything further, they need to contact the
 * salon."
 *
 * So there are three kinds of dog:
 * - covered by a plan that is in good standing: the plan's own groom, at
 *   no charge, and nothing else;
 * - on a plan that cannot be used right now (paused, awaiting payment,
 *   bookings suspended): nothing online, ring the salon;
 * - on no plan: any of the services below, with add-ons from the
 *   catalogue.
 */

export const PORTAL_BOOKING_SERVICES = ["classic_groom", "styled_groom", "bath_only", "deshed", "nail_trim"] as const;
export type PortalBookingService = (typeof PORTAL_BOOKING_SERVICES)[number];

export const PORTAL_BOOKING_SERVICE_LABELS: Record<PortalBookingService, string> = {
  classic_groom: "Classic groom",
  styled_groom: "Styled groom",
  bath_only: "Bath and dry",
  deshed: "De-shed",
  nail_trim: "Nail trim",
};

export type PlanState = "covered" | "on_plan_not_usable" | "none";

/** A plan's groom, as the service a booking carries. */
export function memberServiceFor(planServiceType: string | null | undefined): PortalBookingService {
  return planServiceType === "styled" ? "styled_groom" : "classic_groom";
}

export const MEMBER_EXTRAS_MESSAGE =
  "Your membership covers your dog's regular groom. For anything extra, please contact the salon.";
export const PLAN_NOT_USABLE_MESSAGE =
  "Your dog's membership can't be booked online at the moment. Please contact the salon.";

export type PortalBookingDecision =
  | { ok: true; serviceType: PortalBookingService; member: boolean; addOnIds: number[] }
  | { ok: false; message: string };

/**
 * Settles what a booking request turns into. The server calls this AFTER
 * it has worked out the plan state from the database, never from anything
 * the browser sent, so a member cannot talk their way into a priced
 * service or extras by editing the request.
 */
export function decidePortalBooking(input: {
  planState: PlanState;
  memberService: PortalBookingService | null;
  requestedService: string;
  addOnIds: readonly number[];
}): PortalBookingDecision {
  if (input.planState === "on_plan_not_usable") return { ok: false, message: PLAN_NOT_USABLE_MESSAGE };
  if (input.planState === "covered") {
    if (input.addOnIds.length > 0) return { ok: false, message: MEMBER_EXTRAS_MESSAGE };
    // The plan decides the service, whatever was asked for.
    return { ok: true, serviceType: input.memberService ?? "classic_groom", member: true, addOnIds: [] };
  }
  if (!(PORTAL_BOOKING_SERVICES as readonly string[]).includes(input.requestedService)) {
    return { ok: false, message: "Please choose one of the services shown." };
  }
  const addOnIds = Array.from(new Set(input.addOnIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (addOnIds.length > 10) return { ok: false, message: "Please choose up to 10 extras." };
  return { ok: true, serviceType: input.requestedService as PortalBookingService, member: false, addOnIds };
}

/** An add-on a client can pick: active, and with a list price to show. */
export function isClientPickableAddOn(addOn: { isActive: boolean | number | null; priceMode: string | null; priceAud: string | number | null }): boolean {
  if (!Number(addOn.isActive)) return false;
  if (addOn.priceMode && addOn.priceMode !== "fixed") return false;
  return addOn.priceAud !== null && addOn.priceAud !== "" && Number.isFinite(Number(addOn.priceAud));
}

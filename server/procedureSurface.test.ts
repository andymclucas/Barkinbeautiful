import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseProcedureSurface, idsOfKind } from "./procedureSurface";

/**
 * The line between "anyone on the internet", "a restricted groomer" and
 * "the owner", pinned.
 *
 * This replaces a scatter of assertions like
 * `expect(routerSource).toContain("updateStage: operationalProcedure")`.
 * Those were one-way: they proved a named procedure WAS reachable and said
 * nothing about the other 294, so a new unauthenticated endpoint could be
 * added and nothing would fail. CLAUDE.md §5 is blunt that choosing the
 * wrong builder is a security bug in both directions, so the set is what
 * matters, not a handful of members of it.
 *
 * WHEN THIS FAILS: it is telling you a procedure changed who can reach it.
 * That is sometimes exactly right — clients.create and pets.create moved to
 * operationalProcedure on 13/10/2026 so staff could add a client. Read the
 * diff, satisfy yourself the new reachability is intended, then update the
 * list in the same commit as the change.
 */
const sources = [
  readFileSync(new URL("./routers.ts", import.meta.url), "utf8"),
  ...readdirSync(new URL("./routers/", import.meta.url))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(new URL(`./routers/${f}`, import.meta.url), "utf8")),
];
const surface = parseProcedureSurface(sources);

/**
 * Reachable without signing in at all. Every one of these is deliberate:
 * authentication itself, the client portal (scoped by its own session), the
 * shared grooming card and review link, public online booking, salon
 * signup, staff invitation links, and the Pet Tracker token.
 */
const PUBLIC = [
  "authRouter.completePasswordReset",
  "authRouter.login",
  "authRouter.logout",
  "authRouter.me",
  "authRouter.requestPasswordReset",
  // The client's own photo-upload page, reached by a token texted to
  // them and nothing else. Returns a first name and the reason and stops
  // there — SMS cannot carry a picture here, so the link is the way in.
  "clientPhotosRouter.getByToken",
  "clientPortalRouter.cancelAppointment",
  "clientPortalRouter.completeSetup",
  "clientPortalRouter.createMyCardSetupLink",
  "clientPortalRouter.getChat",
  "clientPortalRouter.getMyPaymentMethod",
  "clientPortalRouter.getMyPortal",
  "clientPortalRouter.getPortal",
  "clientPortalRouter.getSetup",
  "clientPortalRouter.listAvailableSlots",
  "clientPortalRouter.listAvailableSlotsAnyStaff",
  "clientPortalRouter.listReschedulableStaff",
  "clientPortalRouter.login",
  "clientPortalRouter.logout",
  "clientPortalRouter.markChatRead",
  "clientPortalRouter.me",
  "clientPortalRouter.rescheduleAppointment",
  "clientPortalRouter.sendChatMessage",
  "clientPortalRouter.updateMyProfile",
  "groomingReportsRouter.getCardReviewState",
  "groomingReportsRouter.getShared",
  "groomingReportsRouter.markPublicReviewOpened",
  "groomingReportsRouter.submitCardReview",
  // A client joining a membership without an account, the way a guest
  // booking already works. These four READ the catalogue and RECORD a
  // request: none of them charges a card, creates a membership or takes a
  // slot — that is membershipSignupRouter.approve, which is admin-only.
  "membershipSignupRouter.getOptions",
  "membershipSignupRouter.packagesForWeight",
  "membershipSignupRouter.quote",
  "membershipSignupRouter.submit",
  "onlineBookingRouter.create",
  "onlineBookingRouter.createGuest",
  "onlineBookingRouter.listAvailableSlots",
  "onlineBookingRouter.listGroomerProfiles",
  // Slots for the membership sign-up page. Same capacity engine as
  // listAvailableSlots, gated on the membership switch instead of the
  // public booking one, and it books nothing — sign-ups still need
  // approving.
  "onlineBookingRouter.listMembershipSignupSlots",
  // Weight and service in, a catalogue price out. No client data, and the
  // figure has to appear before anyone has identified themselves.
  "onlineBookingRouter.priceEstimate",
  "onlineBookingRouter.validateSlot",
  "salonSignupRouter.create",
  "salonSignupRouter.previewSlug",
  "salonSignupRouter.requestCode",
  "salonSignupRouter.verifyCode",
  "staffRouter.acceptInvitation",
  "staffRouter.getInvitation",
  "trackerRouter.getByToken",
  // A waitlisted client taking a slot that came free, from a texted
  // link. getOffer shows them the time; claim is a REQUEST — the same
  // slot goes to several people and staff decide between them.
  "waitlistRouter.claim",
  "waitlistRouter.getOffer",
  // A client adding themselves to the waitlist. Behind its own tenant
  // switch, holds no slot and charges nothing — the salon still chooses
  // who to offer a cancellation to.
  "waitlistRouter.publicJoin",
  "waitlistRouter.publicOptions",
];

/**
 * Reachable by a restricted `staff` account — a groomer or bather on the
 * floor. protectedProcedure deliberately REJECTS these accounts, so this is
 * the set that decides what the salon floor can do.
 */
const OPERATIONAL = [
  "appointmentAddOnsRouter.add",
  "appointmentAddOnsRouter.catalogue",
  "appointmentAddOnsRouter.list",
  "appointmentAddOnsRouter.remove",
  "appointmentAddOnsRouter.update",
  "authRouter.setTimezone",
  "bookingPricingRouter.catalogue",
  "bookingPricingRouter.context",
  "calendarRouter.addPetsToSharedAppointment",
  "calendarRouter.appointmentsForClient",
  "calendarRouter.createAppointment",
  "calendarRouter.createMultiPetAppointment",
  "calendarRouter.createRecurringAppointments",
  "calendarRouter.createSessionBills",
  "calendarRouter.deleteAppointment",
  "calendarRouter.getAppointments",
  "calendarRouter.getClientMembershipSummary",
  "calendarRouter.getMembershipCoverage",
  "calendarRouter.groomerDay",
  "calendarRouter.reschedule",
  "calendarRouter.searchAppointments",
  "calendarRouter.setAppointmentDiscount",
  "calendarRouter.undoDeleteAppointment",
  "calendarRouter.updateDetails",
  "calendarRouter.updateWorkflowState",
  // Whoever is on the desk is the one who learns that somebody else
  // collects the dog. Tenant-checked against the session, not the client.
  // Asking a client for a photo and reading what they sent is salon-floor
  // work: the groomer who did the groom and whoever takes the call both
  // need it, so restricted staff are not locked out.
  "clientPhotosRouter.listForClient",
  "clientPhotosRouter.listOpenRequests",
  "clientPhotosRouter.request",
  "clientPhotosRouter.revoke",
  "clientsRouter.addContact",
  "clientsRouter.create",
  "clientsRouter.list",
  // Who may be rung about a client. operationalProcedure on purpose: the
  // groomer deciding who to call is the one who needs it, and getProfile,
  // which carries the same contacts, rejects staff outright. Contact
  // details only — not a way around getProfile.
  "clientsRouter.listContacts",
  "clientsRouter.quickPreview",
  "clientsRouter.updateDetails",
  "familyRouter.linkPets",
  "familyRouter.searchPets",
  "familyRouter.unlinkPet",
  "groomStyleNotesRouter.create",
  "groomStyleNotesRouter.delete",
  "groomStyleNotesRouter.getLastCompletedStyle",
  "groomStyleNotesRouter.getLastStyle",
  "groomStyleNotesRouter.listByPet",
  "groomingReportsRouter.attachStaffPhoto",
  "groomingReportsRouter.emailReport",
  "groomingReportsRouter.ensureShareLink",
  "groomingReportsRouter.getByAppointment",
  "groomingReportsRouter.getSessionReports",
  "groomingReportsRouter.upsert",
  "membershipsRouter.create",
  "membershipsRouter.getPackageOptions",
  "membershipsRouter.searchClients",
  "onlineBookingRouter.listAllMoegoIds",
  "paymentsRouter.forBooking",
  "paymentsRouter.record",
  "paymentsRouter.remove",
  "paymentsRouter.setBilledOverride",
  // Reading the pet-code vocabulary. Operational because the board, the
  // pet record and the hover card all show what a code means, and those
  // are the screens a bather works from. The three write procedures are
  // protectedProcedure, so a restricted groomer cannot rename the
  // vocabulary the whole salon reads.
  "petCodesRouter.list",
  "petsRouter.create",
  // The salon's own breed list, read from the dogs on file. Operational
  // because it feeds the breed box on the walk-in and add-pet forms,
  // which the floor uses.
  "petsRouter.listBreeds",
  "petsRouter.listByClient",
  // The dog's usual groomer. A groomer knows which dogs are theirs, and
  // the person taking the booking is who hears "can we have Charlotte
  // again". Tenant-checked on both the pet and the staff member.
  // Tagging a dog. Operational because the person who discovers a dog
  // bites is the groomer holding it, and protectedProcedure would reject
  // the restricted staff who most need to record that.
  "petsRouter.updateCodes",
  "petsRouter.updatePreferredGroomer",
  "petsRouter.updateSizeBand",
  "petsRouter.updateWeight",
  "portalChatRouter.getThread",
  "portalChatRouter.listThreads",
  "portalChatRouter.markRead",
  "portalChatRouter.reply",
  // Who else has a record open. Operational because a bather and a
  // groomer are exactly the people who need to know somebody is already
  // in a dog's appointment; protectedProcedure would reject them.
  "presenceRouter.heartbeat",
  "presenceRouter.leave",
  "pushSubscriptionsRouter.myDevices",
  "pushSubscriptionsRouter.publicKey",
  "pushSubscriptionsRouter.sendTest",
  "pushSubscriptionsRouter.subscribe",
  "pushSubscriptionsRouter.unsubscribe",
  "settingsRouter.getTenantInfo",
  "sidebarCountsRouter.get",
  "smsRouter.assignNotification",
  "smsRouter.getPickupRecipients",
  "smsRouter.myAssignments",
  "smsRouter.sendPickupMessage",
  "smsUsageRouter.get",
  "staffRouter.createBlockout",
  "staffRouter.deleteBlockout",
  "staffRouter.getMyPortal",
  "staffRouter.getMyProfile",
  "staffRouter.listBlockouts",
  "staffRouter.listOperational",
  "staffRouter.updateBlockout",
  "staffRouter.updateMyPhoto",
  "staffRouter.updateMyProfile",
  "trialRouter.get",
  // Putting a client on the waitlist, seeing who is waiting and offering
  // a freed slot are salon-floor work — whoever takes the call needs
  // them, so restricted staff are not locked out.
  "waitlistRouter.approveClaim",
  "waitlistRouter.declineClaim",
  "waitlistRouter.join",
  "waitlistRouter.listClaims",
  "waitlistRouter.listEntries",
  "waitlistRouter.matchesForSlot",
  "waitlistRouter.offer",
  "waitlistRouter.remove",
  "workflowReviewRouter.getBoardThresholds",
  "workflowRouter.getBoard",
  "workflowRouter.getStaff",
  "workflowRouter.getTodayBoard",
  "workflowRouter.reorderBathQueue",
  "workflowRouter.setBathGroup",
  "workflowRouter.setBathPriority",
  "workflowRouter.setCollectBy",
  "workflowRouter.updateStage",
];

describe("tRPC procedure surface", () => {
  it("parses every procedure and attributes it to a router", () => {
    // An unattributed procedure would silently drop out of the sets below,
    // which is the one way this test could pass while missing something.
    expect(surface).toHaveLength(334);
    expect(surface.filter((p) => p.router === "(none)")).toEqual([]);
  });

  it("exposes exactly these procedures without authentication", () => {
    expect(idsOfKind(surface, "public")).toEqual(PUBLIC);
    expect(PUBLIC).toHaveLength(50);
  });

  it("exposes exactly these procedures to restricted staff", () => {
    expect(idsOfKind(surface, "operational")).toEqual(OPERATIONAL);
    expect(OPERATIONAL).toHaveLength(110);
  });

  it("keeps the client list and pet creation reachable by staff", () => {
    // The 13/10/2026 change, named explicitly so a revert is visible rather
    // than just a count moving. The route guard matters too — see
    // staffRoutes.test.ts; the procedures alone did nothing.
    for (const id of ["clientsRouter.create", "clientsRouter.list", "petsRouter.create"]) {
      expect(idsOfKind(surface, "operational"), `${id} must stay staff-reachable`).toContain(id);
    }
  });

  it("keeps bulk client export and the full profile owner-only", () => {
    // Pulling 10,093 clients' contact details into a file is a different
    // act from looking one up at the desk.
    const operational = idsOfKind(surface, "operational");
    expect(operational).not.toContain("clientsRouter.exportCsv");
    expect(operational).not.toContain("clientsRouter.getById");
    expect(idsOfKind(surface, "public")).not.toContain("clientsRouter.list");
  });
});

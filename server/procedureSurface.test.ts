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
  // The texted service-agreement link (/sign/<token>), for clients with no
  // email (11/11/2026). The signed token from server/agreementLinkToken.ts
  // is the identity; it returns a first name, the salon name and the
  // agreements, and can only record that one client's signature on an
  // agreement currently outstanding for them.
  "clientPortalRouter.getAgreementLink",
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
  // Pay for today's appointment (11/11/2026): the portal session or access
  // link is the identity; it only reports and pays THIS client's bookings
  // today, re-checked on the server, and refuses while the service
  // agreement is unsigned (server/portalAppointmentPayment.ts).
  "clientPortalRouter.payTodaysBill",
  "clientPortalRouter.rescheduleAppointment",
  // The cycle window for a membership or repeat booking. Same portal-session
  // check and ownership test as rescheduleAppointment beside it.
  "clientPortalRouter.rescheduleWindow",
  "clientPortalRouter.sendChatMessage",
  // The service agreement, signed by the client themselves before the
  // portal opens (11/11/2026). AtSetup is identified by the emailed setup
  // token, MyAgreements by the portal session or access link — the same
  // identities completeSetup and getMyPortal already trust. Both can only
  // record a signature on an agreement currently outstanding for that one
  // client (shared/portalAgreements.ts).
  "clientPortalRouter.signAgreementsAtSetup",
  "clientPortalRouter.signMyAgreements",
  "clientPortalRouter.signWithAgreementLink",
  "clientPortalRouter.todaysBill",
  "clientPortalRouter.updateMyProfile",
  // An owner answering a quote for extra work found mid-groom, from a
  // texted link. Public on purpose and not behind the portal login: the
  // dog is on the table and an answer is wanted in minutes, so a password
  // reset between the groomer and the answer means no answer.
  //
  // What the token can do is deliberately tiny: approve or decline ONE
  // named piece of work at ONE frozen price, for four hours, after which
  // it bills nothing. It reads no client record and changes no money by
  // itself — an approval only makes the extra billable on an invoice the
  // salon raises later.
  "groomQuotesRouter.answerByToken",
  "groomQuotesRouter.getByToken",
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
  // The salon's public identity — name, logo and four colours — so the
  // pages a salon's own customers land on can be painted in their
  // brand. Narrower than getTenantInfo on purpose: no contact details,
  // no timezone, no billing state.
  "settingsRouter.getPublicBranding",
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
  "analyticsRouter.christmasCountdown",
  "appointmentAddOnsRouter.add",
  "appointmentAddOnsRouter.addRetail",
  "appointmentAddOnsRouter.catalogue",
  "appointmentAddOnsRouter.list",
  "appointmentAddOnsRouter.remove",
  "appointmentAddOnsRouter.setDone",
  "appointmentAddOnsRouter.update",
  "authRouter.getStaffColumnOrder",
  "authRouter.setStaffColumnOrder",
  "authRouter.setTimezone",
  "bookingPricingRouter.catalogue",
  "bookingPricingRouter.context",
  "calendarRouter.addPetsToSharedAppointment",
  /* Repeating a booking that already exists — Bronwyn Waegh, 06/11/2026.
     Operational because turning a booking into a series is floor work:
     the groomer standing with the client at the end of a groom is who
     books the next six. It repeats a booking the caller can already
     reach, through requireApprovedStaffAppointmentAccess. */
  "calendarRouter.addRecurrenceToAppointment",
  "calendarRouter.appointmentsForClient",
  /* Answering "when's your next available booking?" on the phone —
     Lauren, 06/11/2026. Operational because it IS the phone: whoever
     picks up is who needs it, and that is as often a receptionist as
     the owner. It reads the diary's free gaps and returns no money and
     no client details. */
  "calendarRouter.availability",
  /*
   * Cancels every dog of a booking at once so the client gets ONE
   * text instead of one per dog. operationalProcedure like
   * updateWorkflowState beside it: cancelling a dog is salon-floor
   * work. Every row is access-checked individually, so a groomer who
   * can reach one dog of a family but not its siblings is refused the
   * whole action rather than cancelling half of it.
   */
  "calendarRouter.cancelWholeBooking",
  "calendarRouter.createAppointment",
  // One invoice for a whole booking, rather than one per dog.
  "calendarRouter.createCombinedSessionBill",
  "calendarRouter.createMultiPetAppointment",
  /* A walk-in nail clip or quick bath, booked at the counter —
     06/11/2026. Operational: whoever is on the desk when somebody walks
     in with a dog is who uses it, and that is rarely the owner. */
  "calendarRouter.createQuickAppointment",
  "calendarRouter.createRecurringAppointments",
  "calendarRouter.createSessionBills",
  "calendarRouter.deleteAppointment",
  "calendarRouter.getAppointments",
  "calendarRouter.getClientMembershipSummary",
  "calendarRouter.getMembershipCoverage",
  "calendarRouter.groomerDay",
  "calendarRouter.monthCapacity",
  "calendarRouter.nextAvailable",
  "calendarRouter.rebook",
  /* Added 05/11/2026 beside the two above, and reachable by restricted
     staff for the same reason they are: rebooking happens at the
     counter with the client waiting, so a groomer must not hit a
     FORBIDDEN mid-handover. It reads availability only — no contact
     details, no money, nothing the owner surface guards. */
  "calendarRouter.rebookFreeTimes",
  "calendarRouter.rebookSuggestion",
  "calendarRouter.reschedule",
  "calendarRouter.searchAppointments",
  "calendarRouter.setAppointmentDiscount",
  // "Text booking details" on the appointment (11/11/2026), behind the
  // same per-appointment gate as every other operational write.
  "calendarRouter.textBookingDetails",
  "calendarRouter.undoDeleteAppointment",
  "calendarRouter.updateDetails",
  "calendarRouter.updateWorkflowState",
  /* Finding a walk-in who has been in before, by their phone number, so
     three visits do not become three records of the same person. */
  "calendarRouter.walkInMatch",
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
  "clientsRouter.deletePetPhoto",
  "clientsRouter.list",
  // Who may be rung about a client. operationalProcedure on purpose: the
  // groomer deciding who to call is the one who needs it, and getProfile,
  // which carries the same contacts, rejects staff outright. Contact
  // details only — not a way around getProfile.
  "clientsRouter.listContacts",
  "clientsRouter.quickPreview",
  "clientsRouter.updateContact",
  "clientsRouter.updateDetails",
  // The counter till. Lauren Romari, 10/11/2026: "what happens if
  // someone walks in just wanting to buy retail?" Nothing did — every
  // path to a bill went through a booking. operationalProcedure for the
  // same reason addRetail is: whoever is nearest the door when a client
  // picks up a bag of treats is often a bather or a receptionist, and
  // protectedProcedure would leave the floor unable to take money.
  // voidSale is operational too, and refuses anything not rung up today
  // — a typo is the person standing there's to fix, a sale from last
  // week is a refund decision and this does not do refunds.
  "counterSaleRouter.forDay",
  "counterSaleRouter.sell",
  "counterSaleRouter.voidSale",
  "familyRouter.linkPets",
  "familyRouter.searchPets",
  "familyRouter.unlinkPet",
  /*
   * Quoting extra work, 06/11/2026. operationalProcedure throughout,
   * because the person who finds matting is the groomer and most groomers
   * here are restricted `staff` accounts — protectedProcedure would reject
   * exactly the people the feature is for (CLAUDE.md §5).
   *
   * Each one still calls requireApprovedStaffAppointmentAccess, so a
   * groomer reaches only their own salon's bookings. None of them charges
   * anybody: raise and send ask a question, and recordAnswer writes down
   * an answer a person gave, marked as staff-recorded rather than as the
   * owner tapping the link.
   */
  "groomQuotesRouter.listForAppointment",
  "groomQuotesRouter.raise",
  "groomQuotesRouter.recordAnswer",
  "groomQuotesRouter.send",
  "groomQuotesRouter.withdraw",
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
  "issueReportsRouter.markSeen",
  "issueReportsRouter.myUpdates",
  "issueReportsRouter.submit",
  "membershipsRouter.create",
  "membershipsRouter.getPackageOptions",
  "membershipsRouter.searchClients",
  "onlineBookingRouter.listAllMoegoIds",
  "paymentsRouter.cardEntryConfig",
  "paymentsRouter.cardOnFile",
  "paymentsRouter.cardSetupLink",
  "paymentsRouter.chargeCardOnFile",
  "paymentsRouter.createCardSetupIntent",
  "paymentsRouter.forBooking",
  "paymentsRouter.record",
  "paymentsRouter.remove",
  "paymentsRouter.saveCardFromSetupIntent",
  "paymentsRouter.setBilledOverride",
  // Reading the pet-code vocabulary. Operational because the board, the
  // pet record and the hover card all show what a code means, and those
  // are the screens a bather works from. The three write procedures are
  // protectedProcedure, so a restricted groomer cannot rename the
  // vocabulary the whole salon reads.
  "petCodesRouter.list",
  // Archiving a dog and undoing it. Andy, 10/11/2026: "All groomers
  // should have access." Refused while the dog has bookings or a
  // membership, so it cannot cancel anything or move money; records who
  // did it; and Restore undoes it. Tenant-checked on the pet.
  "petsRouter.archive",
  "petsRouter.create",
  // The salon's own breed list, read from the dogs on file. Operational
  // because it feeds the breed box on the walk-in and add-pet forms,
  // which the floor uses.
  "petsRouter.listBreeds",
  "petsRouter.listByClient",
  "petsRouter.restore",
  // The dog's usual groomer. A groomer knows which dogs are theirs, and
  // the person taking the booking is who hears "can we have Charlotte
  // again". Tenant-checked on both the pet and the staff member.
  // Tagging a dog. Operational because the person who discovers a dog
  // bites is the groomer holding it, and protectedProcedure would reject
  // the restricted staff who most need to record that.
  "petsRouter.updateCodes",
  // Correcting a dog's name or breed. Operational because a misspelled
  // name is noticed by the groomer holding the dog. Deleting one is
  // adminProcedure and so is not in this list.
  "petsRouter.updateDetails",
  "petsRouter.updatePreferredGroomer",
  "petsRouter.updateSizeBand",
  "petsRouter.updateWeight",
  /* Added 05/11/2026, reachable by restricted staff for the same reason
     updateWeight above it is: the dog is weighed on the salon floor at
     its groom, so the groomer taking the reading must also be able to
     see what it was last time. Weights only — no contact details, no
     money. */
  "petsRouter.weightHistory",
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
  /*
   * Moving between salons, 06/11/2026. Lauren runs Barkin' Beautiful and
   * The Pet Pad as separate books and needs a switcher.
   *
   * operationalProcedure because the header asks `mine` on every page
   * load and a restricted groomer must be able to render the page they
   * are allowed to be on. It exposes nothing: the list is built from
   * ctx.accessibleTenantIds, which the server derives from the caller's
   * own rows, so it can only ever return salons they already reach.
   *
   * Granting and revoking access are adminProcedure and are NOT here —
   * a row in salon_access is what lets somebody read another business's
   * clients and takings.
   */
  // The shelf without the cost price. retail.list carries costAud and is
  // protectedProcedure for that reason, which left restricted staff — the
  // ones most often at the counter — with an empty product picker on the
  // Shop panel. This is the same rows minus the margin.
  "retailRouter.sellable",
  "salonsRouter.canAccess",
  "salonsRouter.mine",
  "searchRouter.everything",
  "settingsRouter.getTenantInfo",
  "sidebarCountsRouter.get",
  "smsRouter.assignNotification",
  "smsRouter.getPickupRecipients",
  "smsRouter.myAssignments",
  "smsRouter.sendPickupMessage",
  /* Texting a client the dates they are booked in for — Lauren,
     06/11/2026. Operational, unlike sms.sendToClient beside it, because
     the body is BUILT from the client's own bookings and nothing a
     caller can put into it. The free-text composer stays owner-only. */
  "smsRouter.sendUpcomingDates",
  "smsRouter.upcomingDatesPreview",
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
  "waitlistRouter.update",
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
    //
    // 369 since 04/11/2026. Two added that day, both protectedProcedure
    // so neither widens the lists enumerated below:
    //
    //  - clientsRouter.clientRetention, the retention report, matching
    //    overdueForGroom beside it — the client book with contact
    //    details and a value ranking is owner surface.
    //  - clientsRouter.remove, deleting a duplicate client. Note that
    //    protectedProcedure is NOT its real gate: it also checks
    //    canAdministerStaff, because users.role = "admin" includes four
    //    groomers and this removes a record. This file cannot see that
    //    check, so clientDeletion.test.ts carries the rule.
    //
    // 377 since 05/11/2026: clientsRouter gained findDuplicates,
    // mergePreview and mergeInto. protectedProcedure is NOT their real
    // gate — all three also check canAdministerStaff, exactly as
    // clientsRouter.remove does, because merging is more destructive
    // than deleting: it moves one customer's dogs, invoices and history
    // onto another card. This file cannot see that check.
    //
    // 374 since 05/11/2026: retailRouter gained update, setStock and
    // setActive. The shelf could only be added to before — 71 products
    // came across from MoeGo and not one could have its price fixed or
    // its stock corrected. All three are protectedProcedure, like the
    // list and create they sit beside: Pricing & Services is owner
    // surface and is not in STAFF_OPERATION_ROUTES, so a restricted
    // groomer never sees the screen they are on.
    //
    // 378 since 05/11/2026: clientsRouter gained lapsedClients, the
    // win-back report. protectedProcedure matching clientRetention
    // beside it, and for the same reason — it is the client book with
    // phone numbers and a value ranking on it, which is owner surface.
    //
    // 379 since 05/11/2026: calendarRouter gained rebookFreeTimes, the
    // free times on the day the rebook dialog jumped to.
    // operationalProcedure matching nextAvailable and rebookSuggestion
    // beside it — rebooking at the counter is the salon floor, and a
    // restricted groomer doing it must not hit a FORBIDDEN.
    //
    // 380 since 05/11/2026: petsRouter gained weightHistory, every
    // weighing on record for one dog. operationalProcedure like
    // updateWeight beside it, and reachable by restricted staff for the
    // same reason — a dog is weighed on the salon floor at its groom, so
    // a groomer must be able to take the reading and see the last one.
    //
    // 387 since 06/11/2026: the groomQuotes router, for agreeing extra
    // work while the dog is on the table. Five operational (the groomer's
    // end) and two public (the owner's, reached by a texted token).
    //
    // 391 since 06/11/2026: the salons router — mine, canAccess, grant
    // and revoke — for running more than one salon from one account.
    //
    // 404 since 07/11/2026: onlineBooking.create REMOVED. An
    // unauthenticated publicProcedure that inserted an appointment from
    // a caller-supplied clientId and petId, with no caller anywhere.
    //
    // 405 since 07/11/2026: clients.setStatusBulk, for marking several
    // clients active/inactive/blocked at once, and automatedMessages
    // .list, which reports which automated texts can actually reach a
    // client. Both protectedProcedure, so NEITHER appears in the lists
    // below.
    //
    // They arrived on two branches that each bumped this number from 403
    // to 404 independently, so the merge had to land on 405 rather than
    // taking either side. Noted because the same shape will recur: the
    // count is one line and two parallel branches both touch it.
    //
    // 405 since 09/11/2026: appointmentAddOns.addRetail. Andy: "Add
    // retail items into the appointment card so these can be added to
    // the cart for checkout."
    //
    // The assertion read 404 while the comment above it said 405 — the
    // running history and the number had drifted apart at some point.
    // 405 is what the parser actually counts, measured rather than
    // reasoned from the comments.
    //
    // operationalProcedure, deliberately — selling a bag of treats is
    // counter work, and a receptionist or a groomer with the client in
    // front of them is exactly who does it. It writes to the booking
    // they already have open, through the same staff-access check every
    // other add-on takes, so it widens what restricted staff can do by
    // one thing they already do with a card machine.
    //
    // 403 since 06/11/2026: platformBilling — the salon's own subscription
    // to Groomigo. None of the three appears in OPERATIONAL or PUBLIC,
    // which is the point: `status` is protectedProcedure and so rejects
    // restricted staff, and the two that reach Stripe are adminProcedure.
    //
    // 400 since 06/11/2026: calendar.createQuickAppointment and
    // calendar.walkInMatch, for a walk-in nail clip at the counter.
    //
    // 398 since 06/11/2026: calendar.availability, the phone's answer to
    // "when's your next available booking?".
    //
    // 397 since 06/11/2026: sms.upcomingDatesPreview and
    // sms.sendUpcomingDates, for texting a client her list of dates.
    //
    // 395 since 06/11/2026: calendar.addRecurrenceToAppointment, for
    // turning a booking that already exists into a series.
    //
    // 394 since 06/11/2026: salons.provisionPreview, salons.provision and
    // salons.eligibleOwners, for standing up The Pet Pad. All three are
    // adminProcedure — provisioning makes a new business on the platform
    // and hands somebody the keys, and eligibleOwners lists the
    // platform's accounts — so none appears in OPERATIONAL or PUBLIC.
    // 408 since 10/11/2026: counterSale.sell, .forDay and .voidSale —
    // selling retail to somebody with no booking. All three are
    // operationalProcedure and appear in OPERATIONAL below.
    // 410 since 10/11/2026: sms.stats. The Messages tiles counted the
    // fetched PAGE (always 100) and counted `status = 'sent'` as
    // delivered (the step before it, which Twilio passes through in a
    // second), so the page read "100 sent, 0 delivered". protectedProcedure
    // like sms.getLogs beside it, so it is not in OPERATIONAL below.
    // 412 since 10/11/2026: pets.archive and pets.restore, the "archive
    // dog" button. Opened to every groomer the same day, so both are in
    // OPERATIONAL below.
    // 418 since 11/11/2026: the portal invitation with the service
    // agreement first. signAgreementsAtSetup and signMyAgreements are
    // public (the setup token or portal session is the identity, and
    // both are in PUBLIC above); portalInvitePreview, startPortalInvite,
    // resumePortalInvite and portalInviteStatus are adminProcedure, like
    // issuing a single setup link.
    // 420 since 11/11/2026 (later the same day): getAgreementLink and
    // signWithAgreementLink, the texted signing link — both in PUBLIC.
    // 421 since 11/11/2026: calendar.textBookingDetails, in OPERATIONAL.
    // 423 since 11/11/2026: clientPortal.todaysBill and payTodaysBill, in PUBLIC.
    // 427 since 11/11/2026: issueReports — submit in OPERATIONAL (every
    // staff login can report a problem); list, openCount and setStatus are
    // protectedProcedure AND canAdministerStaff inside, owners only.
    // 430 since 11/11/2026 (stage 2): issueReports.myUpdates and markSeen in
    // OPERATIONAL (a reporter's own outcomes only); retriage is owner-only.
    // 431 since 11/11/2026: clientPortal.rescheduleWindow, in PUBLIC.
    expect(surface).toHaveLength(431);
    expect(surface.filter((p) => p.router === "(none)")).toEqual([]);
  });

  it("exposes exactly these procedures without authentication", () => {
    expect(idsOfKind(surface, "public")).toEqual(PUBLIC);
    // 53 since 06/11/2026: groomQuotes getByToken and answerByToken, the
    // owner's end of a mid-groom quote. Unauthenticated by design — the
    // note beside them in PUBLIC says what bounds them.
    // 59 since 11/11/2026: clientPortal.rescheduleWindow.
    expect(PUBLIC).toHaveLength(59);
  });

  it("exposes exactly these procedures to restricted staff", () => {
    expect(idsOfKind(surface, "operational")).toEqual(OPERATIONAL);
    /*
     * 130 since 04/11/2026: calendarRouter.cancelWholeBooking. Salon
     * floor work, like the updateWorkflowState beside it — a groomer
     * cancelling a family is the person this is for. Every row it
     * touches is access-checked on its own, so a groomer who can reach
     * one dog of a booking but not its siblings is refused the whole
     * action rather than cancelling half a family.
     *
     * 131 since 05/11/2026: waitlistRouter.update. It sits beside join
     * and remove, which are already operational — somebody on the desk
     * who can put a client on the list and take them off it is the same
     * person who widens their dates when they ring back, and making the
     * edit owner-only would send them round the delete-and-re-add route
     * that loses the client's place in the queue.
     *
     * 138 since 06/11/2026: the five groomQuotes procedures a groomer
     * uses at the board. A restricted groomer is the whole point of the
     * feature, so protectedProcedure would have locked out everyone it
     * is for.
     *
     * 146 since 06/11/2026: calendar.createQuickAppointment and
     * calendar.walkInMatch. Whoever is on the desk when somebody walks
     * in with a dog is who uses them.
     *
     * 144 since 06/11/2026: calendar.availability. Whoever answers the
     * phone needs it, and that is as often a receptionist as the owner.
     *
     * 143 since 06/11/2026: sms.upcomingDatesPreview and
     * sms.sendUpcomingDates. The receptionist at the desk is who reads a
     * client her dates, and the body is built rather than typed.
     *
     * 141 since 06/11/2026: calendar.addRecurrenceToAppointment. Turning
     * a booking into a series is floor work — the groomer standing with
     * the client at the end of a groom is who books the next six — and it
     * repeats a booking the caller can already reach.
     *
     * 140 since 06/11/2026: salons.mine and salons.canAccess. Both read
     * only from the caller's own access list.
     */
    /*
     * 153 since 10/11/2026: pets.archive and pets.restore. Andy: "All
     * groomers should have access." Guarded so neither can cancel a
     * booking or touch a membership, and reversible.
     */
    /*
     * 155 since 11/11/2026: issueReports.submit. Andy: "all staff" — a
     * report carries no data back, and the owner-only reading half is
     * not operational.
     */
    /*
     * 157 since 11/11/2026: issueReports.myUpdates and markSeen — a
     * reporter hears back about their own reports, filtered to their own
     * user id on the server.
     */
    expect(OPERATIONAL).toHaveLength(157);
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

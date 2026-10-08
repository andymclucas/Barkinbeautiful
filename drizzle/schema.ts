import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  mediumtext,
  timestamp,
  datetime,
  varchar,
  index,
  uniqueIndex,
  bigint,
  date,
} from "drizzle-orm/mysql-core";

// ─── Tenants (Multi-tenant SaaS) ─────────────────────────────────────────────
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  logoUrl: text("logo_url"),
  brandFont: varchar("brand_font", { length: 80 }).default("Inter").notNull(),
  brandPrimary: varchar("brand_primary", { length: 16 }).default("#d61572").notNull(),
  brandAccent: varchar("brand_accent", { length: 16 }).default("#f9d4e7").notNull(),
  brandSidebar: varchar("brand_sidebar", { length: 16 }).default("#2b1830").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Australia/Brisbane").notNull(),
  subscriptionPlan: mysqlEnum("subscription_plan", ["trial", "starter", "professional", "enterprise"]).default("trial").notNull(),
  subscriptionStatus: mysqlEnum("subscription_status", ["active", "past_due", "cancelled", "trialing"]).default("trialing").notNull(),
  /**
   * When a trial stops working. NULL means this salon is not on a trial
   * — Barkin' Beautiful never was, and a paid salon no longer is —
   * which is a different thing from a trial that has run out.
   */
  trialEndsAt: timestamp("trial_ends_at"),
  onlineBookingEnabled: boolean("online_booking_enabled").default(false).notNull(),
  onlineBathOnlyDailyLimit: int("online_bath_only_daily_limit").default(3).notNull(),
  onlineBathCapacityPerSlot: int("online_bath_capacity_per_slot").default(3).notNull(),
  onlineBookingSlotMinutes: int("online_booking_slot_minutes").default(30).notNull(),
  onlineBookingLeadHours: int("online_booking_lead_hours").default(24).notNull(),
  /**
   * The hostname this salon's clients arrive at, when it is not a
   * subdomain of the platform domain. Null for a salon on
   * <slug>.groomigo.com, where the slug is already in the hostname.
   */
  customDomain: varchar("custom_domain", { length: 255 }),
  /**
   * The number this salon texts from and is called on. Both directions:
   * it is the only thing identifying a salon on a Twilio webhook, where
   * there is no signed-in user and no hostname. Null for a salon with no
   * messaging.
   */
  twilioNumber: varchar("twilio_number", { length: 30 }),
  /**
   * Charged per text beyond the monthly allowance. Four decimal places
   * because a per-message rate is cents, not dollars — 5.15c is 0.0515.
   *
   * NULL is NOT zero. Zero means overage is free, which is a real
   * position; NULL means nobody has set a price yet, and the salon is
   * shown "not yet priced" rather than a confident $0.00.
   */
  smsOverageRateAud: decimal("sms_overage_rate_aud", { precision: 10, scale: 4 }),
  /**
   * Never billed, never chased, never downgraded. Barkin' Beautiful is
   * not a customer — the concept is theirs. Kept separate from the plan
   * because WHAT a salon can use and WHETHER they pay are different
   * questions that come apart for partners and pilots.
   */
  billingExempt: boolean("billing_exempt").default(false).notNull(),
  stripeBillingMode: mysqlEnum("stripe_billing_mode", ["prototype", "live"]).default("prototype").notNull(),
  stripeConnectedAt: timestamp("stripe_connected_at"),
  /** The Express connected account this salon's clients pay into. */
  stripeAccountId: varchar("stripe_account_id", { length: 255 }),
  /** Stripe's own verdict, kept in step by the account.updated webhook. */
  stripeChargesEnabled: boolean("stripe_charges_enabled").default(false).notNull(),
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false).notNull(),
  stripeDetailsSubmitted: boolean("stripe_details_submitted").default(false).notNull(),
  /** What Stripe is still waiting for, as JSON, so the salon can be told. */
  stripeRequirementsDue: text("stripe_requirements_due"),
  /**
   * Groomigo's cut of each client payment, in BASIS POINTS — 250 is 2.5%.
   * Basis points rather than a percent because 0.025 and 2.5 are only
   * ever told apart by someone being charged a hundred times too much.
   * NULL means undecided; zero means deliberately nothing.
   */
  platformFeeBps: int("platform_fee_bps"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ─── Users (Auth — staff accounts) ───────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  tenantId: int("tenant_id").references(() => tenants.id),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  passwordResetTokenHash: varchar("passwordResetTokenHash", { length: 255 }),
  passwordResetExpiresAt: timestamp("passwordResetExpiresAt"),
  role: mysqlEnum("role", ["user", "admin", "staff"]).default("user").notNull(),
  // IANA zone the user picked when they set up their account, e.g.
  // "Australia/Perth". Nullable: existing accounts predate the column, and a
  // null falls back to the salon's own tenants.timezone.
  timezone: varchar("timezone", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Staff ────────────────────────────────────────────────────────────────────
export const staff = mysqlTable("staff", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  address: text("address"),
  notes: text("notes"),
  dateOfBirth: date("date_of_birth"),
  emergencyContact: varchar("emergency_contact", { length: 255 }),
  emergencyPhone: varchar("emergency_phone", { length: 30 }),
  emergencyEmail: varchar("emergency_email", { length: 320 }),
  /** Asked for by the owner. A roster is a reasonable place for one human detail. */
  favouriteIceCream: varchar("favourite_ice_cream", { length: 100 }),
  role: mysqlEnum("role", ["owner", "groomer", "bather", "receptionist", "manager"]).default("groomer").notNull(),
  colourHex: varchar("colour_hex", { length: 7 }).default("#6366f1").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  /**
   * Takes appointments. Separate from isActive: deactivating removes
   * someone from the platform, this only removes them from the roster.
   * Andy administers the system and does not groom.
   */
  rostered: boolean("rostered").default(true).notNull(),
  /**
   * What this person is expected to bring in. NULL means no target has been
   * set — which is not the same as a target of zero, and is why this is
   * nullable rather than defaulting to 0.00.
   */
  /**
   * Clips this person can do in a day — classic and styled grooms only.
   * Desheds go to the bathers and do not count against a groomer's day.
   * NULL means nobody has said, which is not the same as zero.
   */
  dailyClipCapacity: int("daily_clip_capacity"),
  revenueTarget: decimal("revenue_target", { precision: 10, scale: 2 }),
  /**
   * What the amount above is EXPRESSED in, not how it is viewed. The staff
   * tab scales one stored target across a day, week, month or quarter, so
   * the salon maintains one number per person rather than four.
   */
  revenueTargetPeriod: mysqlEnum("revenue_target_period", ["daily", "weekly", "monthly", "quarterly"]).default("weekly").notNull(),
  xeroEmployeeId: varchar("xero_employee_id", { length: 100 }),
  onlineBookable: boolean("online_bookable").default(false).notNull(),
  onlineProfilePhotoUrl: text("online_profile_photo_url"),
  onlineBio: text("online_bio"),
  onlineServices: text("online_services"),
  onlineMaxDogsPerSlot: int("online_max_dogs_per_slot").default(1).notNull(),
  onlineMaxDogsPerDay: int("online_max_dogs_per_day").default(0).notNull(),
  portalStatus: mysqlEnum("portal_status", ["not_invited", "invited", "awaiting_approval", "approved", "revoked"]).default("not_invited").notNull(),
  /**
   * Admin rights, and the sections they cover.
   *
   * Separate on purpose: revoking rights must not require clearing the tick
   * boxes, so restoring someone brings back what they had. Both are needed
   * to edit anything - see shared/staffPermissions.ts.
   */
  isAdmin: boolean("is_admin").default(false).notNull(),
  adminSections: json("admin_sections"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [index("idx_staff_tenant").on(t.tenantId)]);

// ─── Workflow timing review thresholds ───────────────────────────────────────
// Each salon may use the standard threshold, a pet-size preset or a breed
// override. scopeKey is canonical and tenant-unique so the same preset cannot
// be created twice for a salon.
export const workflowTimingReviewThresholds = mysqlTable("workflow_timing_review_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  scope: mysqlEnum("scope", ["default", "size", "breed"]).notNull(),
  scopeKey: varchar("scope_key", { length: 120 }).notNull(),
  petSize: varchar("pet_size", { length: 32 }),
  breedName: varchar("breed_name", { length: 100 }),
  bathMinutes: int("bath_minutes").notNull(),
  dryMinutes: int("dry_minutes").notNull(),
  groomMinutes: int("groom_minutes").notNull(),
  totalMinutes: int("total_minutes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_workflow_review_threshold_scope").on(t.tenantId, t.scopeKey),
  index("idx_workflow_review_threshold_tenant").on(t.tenantId),
]);

// ─── Staff Invitations and Access Audit ───────────────────────────────────────
// The raw acceptance token is emailed once and is never stored. Staff must accept
// their own account before an administrator can approve access.
export const staffInvitations = mysqlTable("staff_invitations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  userId: int("user_id").references(() => users.id),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "accepted", "approved", "revoked", "expired"]).default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  approvedAt: timestamp("approved_at"),
  invitedByUserId: int("invited_by_user_id").notNull().references(() => users.id),
  approvedByUserId: int("approved_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_staff_invitation_staff").on(t.staffId),
  index("idx_staff_invitation_tenant_status").on(t.tenantId, t.status),
]);

export const staffAccessEvents = mysqlTable("staff_access_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  invitationId: int("invitation_id").references(() => staffInvitations.id),
  actorUserId: int("actor_user_id").references(() => users.id),
  eventType: mysqlEnum("event_type", ["invited", "accepted", "approved", "revoked", "workflow_updated", "bath_priority_updated", "grooming_card_uploaded"]).notNull(),
  note: text("note"),
  appointmentId: int("appointment_id"),
  workflowFromState: varchar("workflow_from_state", { length: 32 }),
  workflowToState: varchar("workflow_to_state", { length: 32 }),
  occurredAtMs: bigint("occurred_at_ms", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_staff_access_events_staff").on(t.staffId),
  index("idx_staff_access_events_tenant").on(t.tenantId),
  index("idx_staff_access_events_appointment").on(t.appointmentId),
]);

// ─── Clients ──────────────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  address: text("address"),
  notes: text("notes"),
  status: mysqlEnum("status", ["active", "inactive", "lapsed", "blocked"]).default("active").notNull(),
  referralSource: varchar("referral_source", { length: 100 }),
  /** When they told us to stop texting. Set from an inbound STOP reply. */
  smsOptedOutAt: timestamp("sms_opted_out_at"),
  portalPasswordHash: text("portal_password_hash"),
  portalLoginEmail: varchar("portal_login_email", { length: 320 }),
  portalAccountStatus: mysqlEnum("portal_account_status", ["not_enabled", "setup_pending", "active", "revoked"]).default("not_enabled").notNull(),
  portalSetupTokenHash: varchar("portal_setup_token_hash", { length: 64 }),
  portalSetupExpiresAt: timestamp("portal_setup_expires_at"),
  portalLastSignedInAt: timestamp("portal_last_signed_in_at"),
  portalSessionVersion: int("portal_session_version").default(0).notNull(),
  moegoClientId: varchar("moego_client_id", { length: 100 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  // A card the salon may charge off-session - weekly membership billing and
  // the payment retry both need the payment method, not just the customer.
  // Brand/last4/expiry mirror what Stripe holds so staff can talk about the
  // card at the counter, and so an expired card is skipped rather than
  // burning a retry. No card number or CVC is ever stored here.
  stripeDefaultPaymentMethodId: varchar("stripe_default_payment_method_id", { length: 255 }),
  stripeCardBrand: varchar("stripe_card_brand", { length: 40 }),
  stripeCardLast4: varchar("stripe_card_last4", { length: 4 }),
  stripeCardExpMonth: int("stripe_card_exp_month"),
  stripeCardExpYear: int("stripe_card_exp_year"),
  stripeCardSavedAt: timestamp("stripe_card_saved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_clients_tenant").on(t.tenantId),
  uniqueIndex("uq_clients_tenant_portal_login_email").on(t.tenantId, t.portalLoginEmail),
]);

// ─── Additional Client Contacts ───────────────────────────────────────────────
// The client's phone remains the primary contact. This table stores optional
// additional approved contacts who may receive a manually sent pickup message.
export const clientContacts = mysqlTable("client_contacts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  email: varchar("email", { length: 320 }),
  relationship: varchar("relationship", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_client_contacts_tenant_client").on(t.tenantId, t.clientId),
  index("idx_client_contacts_phone").on(t.phone),
]);

// ─── Client portal access ─────────────────────────────────────────────────────
// Raw access tokens are never stored. Administrators create a temporary link and
// share it manually; issuing a new link revokes the previous active link.
export const clientPortalAccess = mysqlTable("client_portal_access", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastAccessedAt: timestamp("last_accessed_at"),
  issuedByUserId: int("issued_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_client_portal_access_client").on(t.clientId),
  index("idx_client_portal_access_tenant_status").on(t.tenantId, t.status),
]);

// ─── Pets ─────────────────────────────────────────────────────────────────────
export const pets = mysqlTable("pets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  name: varchar("name", { length: 100 }).notNull(),
  species: mysqlEnum("species", ["dog", "cat", "other"]).default("dog").notNull(),
  breed: varchar("breed", { length: 100 }),
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }),
  /**
   * Size band, as distinct from a measured weight.
   *
   * Derived from the service MoeGo booked the dog under, because MoeGo puts
   * no weight in any export we can reach. Ids match MEMBERSHIP_WEIGHT_BANDS
   * so the salon has one size vocabulary, not two.
   */
  sizeBand: mysqlEnum("size_band", ["small", "small_medium", "medium", "large", "extra_large", "giant"]),
  /** "moego_service" or "manual". An import never overwrites "manual". */
  sizeBandSource: varchar("size_band_source", { length: 32 }),
  coatType: varchar("coat_type", { length: 100 }),
  colour: varchar("colour", { length: 100 }),
  dateOfBirth: timestamp("date_of_birth"),
  gender: mysqlEnum("gender", ["male", "female", "unknown"]).default("unknown").notNull(),
  desexed: boolean("desexed").default(false).notNull(),
  vaccineExpiry: timestamp("vaccine_expiry"),
  behaviourNotes: text("behaviour_notes"),
  groomingNotes: text("grooming_notes"),
  preferredGroomerId: int("preferred_groomer_id").references(() => staff.id),
  moegoClientId: varchar("moego_pet_id", { length: 100 }),
  moeGoPetCodes: json("moego_pet_codes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  alertLevel: mysqlEnum("alert_level", ["ok", "caution", "danger"]).default("ok").notNull(),
  photoContentType: varchar("photo_content_type", { length: 50 }),
  photoData: mediumtext("photo_data"),
  warnings: text("warnings"),
  weight: decimal("weight", { precision: 5, scale: 2 }),
  familyGroupId: int("family_group_id"),
  status: mysqlEnum("status", ["active", "departed"]).default("active").notNull(),
  departedAt: timestamp("departed_at"),
}, (t) => [index("idx_pets_client").on(t.clientId), index("idx_pets_tenant").on(t.tenantId)]);

// ─── Appointments ─────────────────────────────────────────────────────────────
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  staffId: int("staff_id").references(() => staff.id),
  serviceType: mysqlEnum("service_type", ["classic_groom", "styled_groom", "bath_only", "fft", "nail_trim", "daycare", "deshed", "other"]).default("classic_groom").notNull(),
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end").notNull(),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  workflowState: mysqlEnum("workflow_state", ["scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete", "cancelled", "no_show"]).default("scheduled").notNull(),
  trackerToken: varchar("tracker_token", { length: 64 }).unique(),
  trackerSmsSent: boolean("tracker_sms_sent").default(false).notNull(),
  estimatedPickupAt: timestamp("estimated_pickup_at"),
  /**
   * When the dog HAS to be gone by, because the client said so. Distinct
   * from estimatedPickupAt, which is when we think the groom will finish.
   * Null for almost every booking.
   */
  collectBy: timestamp("collect_by"),
  notes: text("notes"),
  membershipId: int("membership_id").references(() => memberships.id),
  /**
   * Amount COLLECTED, from MoeGo's net sales. Not what was charged - see
   * grossPrice. Null means no figure was ever recorded, which is not the same
   * as zero; paymentStatus says which.
   */
  price: decimal("price", { precision: 10, scale: 2 }),
  /** Amount CHARGED, before discounts and non-payment (MoeGo gross sales). */
  grossPrice: decimal("gross_price", { precision: 10, scale: 2 }),
  /**
   * Staff discount. 5, 10, 15 or 20 — validated in
   * shared/appointmentDiscount.ts, not by the column type. When set,
   * preDiscountPrice holds the original and price holds what the client
   * pays, so family totals and split bills pick the discount up
   * automatically.
   */
  discountPercent: int("discount_percent"),
  /** Why. Required whenever discountPercent is set; enforced in shared/. */
  discountReason: varchar("discount_reason", { length: 200 }),
  /**
   * What `price` was immediately before the discount. Deliberately NOT
   * grossPrice, which already means "charged before non-payment" for
   * imported rows — see migration 0064.
   */
  preDiscountPrice: decimal("pre_discount_price", { precision: 10, scale: 2 }),
  discountAppliedByUserId: int("discount_applied_by_user_id"),
  discountAppliedAt: timestamp("discount_applied_at"),
  /** Whether the money arrived, per MoeGo. Null where MoeGo has no view. */
  paymentStatus: mysqlEnum("payment_status", ["unpaid", "partial", "paid"]),
  status: mysqlEnum("status", ["confirmed", "pending", "cancelled", "no_show"]).default("confirmed").notNull(),
  moegoAppointmentId: varchar("moego_appointment_id", { length: 100 }),
  sessionId: varchar("session_id", { length: 64 }),
  recurringGroupId: varchar("recurring_group_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  cageNumber: int("cage_number"),
  tagNumber: int("tag_number"),
  bathStaffId: int("bath_staff_id"),
  bathPriority: int("bath_priority"),
  bathQueueOrder: int("bath_queue_order"),
  bathGroupId: varchar("bath_group_id", { length: 64 }),
  dryStaffId: int("dry_staff_id"),
  workflowAddOns: text("workflow_add_ons"),
  checkedInAt: bigint("checked_in_at", { mode: "number" }),
  stageStartedAt: bigint("stage_started_at", { mode: "number" }),
  bathingStartedAt: bigint("bathing_started_at", { mode: "number" }),
  bathingCompletedAt: bigint("bathing_completed_at", { mode: "number" }),
  dryingStartedAt: bigint("drying_started_at", { mode: "number" }),
  dryingCompletedAt: bigint("drying_completed_at", { mode: "number" }),
  groomingStartedAt: bigint("grooming_started_at", { mode: "number" }),
  groomingCompletedAt: bigint("grooming_completed_at", { mode: "number" }),
  readyAt: bigint("ready_at", { mode: "number" }),
  completedAt: bigint("completed_at", { mode: "number" }),
  pickedUpAt: bigint("picked_up_at", { mode: "number" }),
  reminderSentAt: timestamp("reminder_sent_at"),
  reminder4dSentAt: timestamp("reminder_4d_sent_at"),
  reminder2dSentAt: timestamp("reminder_2d_sent_at"),
  reminderMorningSentAt: timestamp("reminder_morning_sent_at"),
}, (t) => [
  index("idx_appt_tenant_date").on(t.tenantId, t.scheduledStart),
  index("idx_appt_staff").on(t.staffId),
  index("idx_appt_pet").on(t.petId),
]);

// ─── Workflow Logs (Pet Tracker history) ──────────────────────────────────────
export const workflowLogs = mysqlTable("workflow_logs", {
  id: int("id").autoincrement().primaryKey(),
  appointmentId: int("appointment_id").notNull().references(() => appointments.id),
  fromState: mysqlEnum("from_state", ["scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete", "cancelled", "no_show"]),
  toState: mysqlEnum("to_state", ["scheduled", "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete", "cancelled", "no_show"]).notNull(),
  changedByStaffId: int("changed_by_staff_id").references(() => staff.id),
  changedAtMs: bigint("changed_at_ms", { mode: "number" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  notes: text("notes"),
}, (t) => [index("idx_workflow_appt").on(t.appointmentId)]);

// ─── Memberships ──────────────────────────────────────────────────────────────
export const memberships = mysqlTable("memberships", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  name: varchar("name", { length: 255 }).notNull(),
  tier: mysqlEnum("tier", ["diamond", "platinum", "gold", "silver", "bronze"]).notNull(),
  serviceType: mysqlEnum("service_type", ["classic", "styled"]).default("classic").notNull(),
  billingCycleWeeks: int("billing_cycle_weeks").default(1).notNull(),
  appointmentIntervalWeeks: int("appointment_interval_weeks"),
  pricePerCycle: decimal("price_per_cycle", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "cancelled", "pending_payment", "expired"]).default("active").notNull(),
  paymentGateway: mysqlEnum("payment_gateway", ["square", "stripe", "cash", "other"]).default("square").notNull(),
  gatewaySubscriptionId: varchar("gateway_subscription_id", { length: 255 }),
  nextBillingDate: timestamp("next_billing_date"),
  failedPaymentCount: int("failed_payment_count").default(0).notNull(),
  lastFailedPaymentAt: timestamp("last_failed_payment_at"),
  bookingSuspended: boolean("booking_suspended").default(false).notNull(),
  paymentRetryScheduledAt: datetime("payment_retry_scheduled_at"),
  moegoMembershipId: varchar("moego_membership_id", { length: 100 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at"),
  /** A human has seen the failed-payment notification; it stays listed until resolved. */
  noticeReadAt: timestamp("notice_read_at"),
  noticeReadByUserId: int("notice_read_by_user_id"),
  isTest: boolean("is_test").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [index("idx_membership_tenant").on(t.tenantId), index("idx_membership_client").on(t.clientId)]);

// ─── Pricing & Services (Phase 1 foundation) ──────────────────────────────────
// These editable catalogues are intentionally additive. Existing appointments,
// memberships and historical prices continue to use their established fields until
// a separately tested Phase 3 cutover reads from these records.
export const pricingServices = mysqlTable("pricing_services", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  catalogueType: mysqlEnum("catalogue_type", ["service", "add_on"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  description: text("description"),
  priceMode: mysqlEnum("price_mode", ["fixed", "range", "from", "quote"]).default("fixed").notNull(),
  priceAud: decimal("price_aud", { precision: 10, scale: 2 }),
  priceMaxAud: decimal("price_max_aud", { precision: 10, scale: 2 }),
  durationMinutes: int("duration_minutes"),
  legacyServiceType: varchar("legacy_service_type", { length: 50 }),
  weightBand: varchar("weight_band", { length: 80 }),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_pricing_services_tenant_code").on(t.tenantId, t.code),
  index("idx_pricing_services_tenant_type").on(t.tenantId, t.catalogueType),
]);

export const membershipPlans = mysqlTable("membership_plans", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  tier: varchar("tier", { length: 50 }).notNull(),
  serviceVariant: varchar("service_variant", { length: 80 }),
  weightBand: varchar("weight_band", { length: 80 }),
  weeklyPriceAud: decimal("weekly_price_aud", { precision: 10, scale: 2 }).notNull(),
  billingCycleWeeks: int("billing_cycle_weeks").default(1).notNull(),
  appointmentIntervalWeeks: int("appointment_interval_weeks").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_membership_plans_tenant_code").on(t.tenantId, t.code),
  index("idx_membership_plans_tenant_active").on(t.tenantId, t.isActive),
]);

// ─── Membership Payments ──────────────────────────────────────────────────────
export const membershipPayments = mysqlTable("membership_payments", {
  id: int("id").autoincrement().primaryKey(),
  membershipId: int("membership_id").notNull().references(() => memberships.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["paid", "failed", "refunded", "pending"]).default("pending").notNull(),
  gatewayPaymentId: varchar("gateway_payment_id", { length: 255 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }),
  failureReason: text("failure_reason"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Pet Membership Events (departed-pet audit trail) ─────────────────────────
export const petMembershipEvents = mysqlTable("pet_membership_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  membershipId: int("membership_id").references(() => memberships.id),
  replacementPetId: int("replacement_pet_id").references(() => pets.id),
  eventType: mysqlEnum("event_type", ["pet_marked_departed", "membership_removed", "membership_transferred"]).notNull(),
  note: text("note"),
  changedByUserId: int("changed_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_pet_membership_events_pet").on(t.petId),
  index("idx_pet_membership_events_membership").on(t.membershipId),
  index("idx_pet_membership_events_client").on(t.clientId),
]);

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  appointmentId: int("appointment_id").references(() => appointments.id),
  membershipId: int("membership_id").references(() => memberships.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "paid", "overdue", "cancelled"]).default("draft").notNull(),
  paymentMethod: mysqlEnum("payment_method", ["square", "stripe", "cash", "eftpos", "bank_transfer"]),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  stripeCheckoutUrl: text("stripe_checkout_url"),
  paidAt: timestamp("paid_at"),
  dueAt: timestamp("due_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [index("idx_invoice_tenant").on(t.tenantId), index("idx_invoice_client").on(t.clientId)]);

// ─── Invoice Line Items ───────────────────────────────────────────────────────
export const invoiceLineItems = mysqlTable("invoice_line_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoice_id").notNull().references(() => invoices.id),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 8, scale: 2 }).default("1").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  productId: int("product_id").references(() => retailProducts.id),
});

// ─── Membership Accounts Receivable Ledger ────────────────────────────────────
// Positive payment and credit entries reduce the amount owed; groom-value and
// debit entries represent the value delivered to the membership.
export const membershipLedgerEntries = mysqlTable("membership_ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  membershipId: int("membership_id").notNull().references(() => memberships.id),
  appointmentId: int("appointment_id").references(() => appointments.id),
  invoiceId: int("invoice_id").references(() => invoices.id),
  entryType: mysqlEnum("entry_type", ["payment", "groom_value", "credit_adjustment", "debit_adjustment"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  source: mysqlEnum("source", ["stripe", "moego_import", "manual", "cash", "system"]).default("manual").notNull(),
  externalReference: varchar("external_reference", { length: 255 }),
  note: text("note"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdByUserId: int("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_membership_ledger_membership").on(t.membershipId),
  index("idx_membership_ledger_tenant_date").on(t.tenantId, t.occurredAt),
  index("idx_membership_ledger_invoice").on(t.invoiceId),
]);

// ─── Stripe Event Audit ───────────────────────────────────────────────────────
// Records only Stripe event identifiers and Groomigo relationships. Raw webhook
// payloads, card data and Stripe secrets are never persisted.
export const stripeEvents = mysqlTable("stripe_events", {
  id: int("id").autoincrement().primaryKey(),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").references(() => clients.id),
  membershipId: int("membership_id").references(() => memberships.id),
  invoiceId: int("invoice_id").references(() => invoices.id),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
}, (t) => [index("idx_stripe_events_tenant").on(t.tenantId)]);

// ─── Retail Products ──────────────────────────────────────────────────────────
export const retailProducts = mysqlTable("retail_products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  priceAud: decimal("price_aud", { precision: 10, scale: 2 }).notNull(),
  costAud: decimal("cost_aud", { precision: 10, scale: 2 }),
  stockQty: int("stock_qty").default(0).notNull(),
  reorderThreshold: int("reorder_threshold").default(5).notNull(),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [index("idx_product_tenant").on(t.tenantId)]);

// ─── Timesheets ───────────────────────────────────────────────────────────────
export const timesheets = mysqlTable("timesheets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  breakMinutes: int("break_minutes").default(0).notNull(),
  totalMinutes: int("total_minutes"),
  notes: text("notes"),
  xeroSynced: boolean("xero_synced").default(false).notNull(),
  xeroTimesheetId: varchar("xero_timesheet_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_timesheet_staff").on(t.staffId)]);

// ─── Pet Photos ───────────────────────────────────────────────────────────────
// ─── Uploaded Images (generic DB-backed blob store) ────────────────────────────
// Drop-in replacement for the external Forge storage used by storagePut/
// storageGet, which isn't configured in this environment. Anything that used
// to get a random {key, url} pair from Forge can instead store the image
// here under a random key and serve it back by that same key \u2014 the calling
// code barely needs to change.
export const uploadedImages = mysqlTable("uploaded_images", {
  id: int("id").autoincrement().primaryKey(),
  storageKey: varchar("storage_key", { length: 255 }).notNull(),
  photoData: mediumtext("photo_data").notNull(),
  photoContentType: varchar("photo_content_type", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_uploaded_images_key").on(t.storageKey)]);

export const petPhotos = mysqlTable("pet_photos", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  appointmentId: int("appointment_id").references(() => appointments.id),
  url: text("url").notNull(),
  storageKey: text("storage_key"),
  caption: text("caption"),
  photoData: mediumtext("photo_data"),
  photoContentType: varchar("photo_content_type", { length: 50 }),
  takenAt: timestamp("taken_at").defaultNow().notNull(),
}, (t) => [index("idx_photo_pet").on(t.petId)]);

// ─── Staff Blockouts (unavailability / leave) ────────────────────────────────
export const staffBlockouts = mysqlTable("staff_blockouts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  blockoutDate: timestamp("blockout_date").notNull(), // the calendar date (time portion ignored for full-day)
  startTime: varchar("start_time", { length: 5 }), // "HH:MM" — null means full day
  endTime: varchar("end_time", { length: 5 }),     // "HH:MM" — null means full day
  isFullDay: boolean("is_full_day").default(true).notNull(),
  reason: varchar("reason", { length: 255 }),
  /**
   * Shared by every day of one blocked-out range, so "the 9th to the
   * 20th" can be edited or cancelled as the single decision it was.
   * Null on rows created one day at a time, which is all nine that
   * predate this.
   */
  groupId: varchar("group_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_blockout_staff").on(t.staffId), index("idx_blockout_tenant_date").on(t.tenantId, t.blockoutDate), index("idx_blockout_group").on(t.groupId)]);

// ─── Groom Style Notes ───────────────────────────────────────────────────────
export const groomStyleNotes = mysqlTable("groom_style_notes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  appointmentId: int("appointment_id").references(() => appointments.id),
  staffId: int("staff_id").references(() => staff.id),
  note: text("note").notNull(),
  serviceType: varchar("service_type", { length: 50 }),
  bladeSize: varchar("blade_size", { length: 20 }),
  combSize: varchar("comb_size", { length: 20 }),
  bodyLength: varchar("body_length", { length: 50 }),
  headStyle: varchar("head_style", { length: 100 }),
  faceStyle: varchar("face_style", { length: 100 }),
  earStyle: varchar("ear_style", { length: 100 }),
  legStyle: varchar("leg_style", { length: 100 }),
  tailStyle: varchar("tail_style", { length: 100 }),
  warnings: text("warnings"),
  alertLevel: varchar("alert_level", { length: 20 }),
  presetId: int("preset_id"),
  photoUrl: text("photo_url"),
  photoKey: varchar("photo_key", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_style_notes_pet").on(t.petId), index("idx_style_notes_tenant").on(t.tenantId)]);

// ─── Groom Style Presets ─────────────────────────────────────────────────────
export const groomStylePresets = mysqlTable("groom_style_presets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 150 }).notNull(),
  serviceType: varchar("service_type", { length: 50 }),
  bladeSize: varchar("blade_size", { length: 20 }),
  combSize: varchar("comb_size", { length: 20 }),
  bodyLength: varchar("body_length", { length: 50 }),
  headStyle: varchar("head_style", { length: 100 }),
  faceStyle: varchar("face_style", { length: 100 }),
  earStyle: varchar("ear_style", { length: 100 }),
  tailStyle: varchar("tail_style", { length: 100 }),
  legStyle: varchar("leg_style", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_preset_tenant").on(t.tenantId)]);

// ─── Email Campaigns ────────────────────────────────────────────────────────
export const emailCampaigns = mysqlTable("email_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  previewText: varchar("preview_text", { length: 500 }),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  audienceFilter: text("audience_filter"), // JSON stored as text
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "cancelled"]).notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  totalRecipients: int("total_recipients").default(0),
  totalSent: int("total_sent").default(0),
  totalOpened: int("total_opened").default(0),
  totalClicked: int("total_clicked").default(0),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [index("idx_campaign_tenant").on(t.tenantId)]);
export type EmailCampaign = typeof emailCampaigns.$inferSelect;

export const emailCampaignSends = mysqlTable("email_campaign_sends", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaign_id").notNull(),
  clientId: int("client_id").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "bounced"]).notNull().default("pending"),
  resendMessageId: varchar("resend_message_id", { length: 255 }),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_send_campaign").on(t.campaignId), index("idx_send_client").on(t.clientId)]);
export type EmailCampaignSend = typeof emailCampaignSends.$inferSelect;

export const emailUnsubscribes = mysqlTable("email_unsubscribes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  clientId: int("client_id"),
  email: varchar("email", { length: 320 }).notNull(),
  unsubscribedAt: timestamp("unsubscribed_at").defaultNow().notNull(),
  reason: varchar("reason", { length: 500 }),
}, (t) => [index("idx_unsub_tenant").on(t.tenantId)]);
export type EmailUnsubscribe = typeof emailUnsubscribes.$inferSelect;

// ─── Migration Jobs ───────────────────────────────────────────────────────────
export const migrationJobs = mysqlTable("migration_jobs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  type: mysqlEnum("type", ["csv_import", "moego_extract"]).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  totalRecords: int("total_records").default(0).notNull(),
  processedRecords: int("processed_records").default(0).notNull(),
  errorCount: int("error_count").default(0).notNull(),
  errorLog: text("error_log"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Grooming Reports ───────────────────────────────────────────────────────────
export const groomingReports = mysqlTable("grooming_reports", {
  id: int("id").autoincrement().primaryKey(),
  appointmentId: int("appointment_id").notNull().references(() => appointments.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  // Overall feedback
  overallRating: mysqlEnum("overall_rating", ["pawfect", "great", "good", "okay", "difficult"]).default("good"),
  mood: varchar("mood", { length: 500 }), // comma-separated tags e.g. "Happy,Well behaved"
  additionalNote: text("additional_note"),
  groomerNotes: text("groomer_notes"),
  // Pet conditions
  coatCondition: mysqlEnum("coat_condition", ["excellent", "good", "fair", "poor", "matted"]),
  skinCondition: mysqlEnum("skin_condition", ["excellent", "good", "fair", "irritated", "flaky"]),
  eyeCondition: mysqlEnum("eye_condition", ["bright_clear", "mild_discharge", "needs_vet"]),
  earCondition: mysqlEnum("ear_condition", ["clean", "mild_buildup", "dirty", "needs_vet"]),
  nailCondition: mysqlEnum("nail_condition", ["trimmed", "long", "very_long", "broken"]),
  teethCondition: mysqlEnum("teeth_condition", ["clean", "mild_tartar", "heavy_tartar", "needs_vet"]),
  // Showcase photos
  beforePhotoUrl: text("before_photo_url"),
  beforePhotoKey: varchar("before_photo_key", { length: 255 }),
  afterPhotoUrl: text("after_photo_url"),
  afterPhotoKey: varchar("after_photo_key", { length: 255 }),
  // Recommended frequency
  recommendedFrequencyWeeks: int("recommended_frequency_weeks"),
  // Status
  status: mysqlEnum("status", ["draft", "sent"]).default("draft").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_report_appt").on(t.appointmentId),
  index("idx_report_pet").on(t.petId),
]);

// ─── Client portal chat ───────────────────────────────────────────────────────
/**
 * One thread per client. Read state is two "last read at" timestamps rather
 * than unread counters, so a count is always derived from the messages and
 * cannot drift away from them.
 */
export const portalThreads = mysqlTable("portal_threads", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  status: mysqlEnum("status", ["open", "awaiting_staff", "closed"]).default("open").notNull(),
  lastMessageAt: timestamp("last_message_at"),
  lastClientMessageAt: timestamp("last_client_message_at"),
  staffLastReadAt: timestamp("staff_last_read_at"),
  /** Who opened it last — a message looked at and not acted on is attributable. */
  staffLastReadByUserId: int("staff_last_read_by_user_id"),
  clientLastReadAt: timestamp("client_last_read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_portal_threads_tenant_client").on(t.tenantId, t.clientId),
  index("idx_portal_threads_tenant_status").on(t.tenantId, t.status),
]);

export const portalMessages = mysqlTable("portal_messages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  threadId: int("thread_id").notNull().references(() => portalThreads.id),
  /** Who wrote it. "assistant" is the salon's automated first reply. */
  sender: mysqlEnum("sender", ["client", "assistant", "staff"]).notNull(),
  staffId: int("staff_id").references(() => staff.id),
  body: text("body").notNull(),
  /** True when the assistant could not answer and promised a human would. */
  handedOff: boolean("handed_off").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_portal_messages_thread").on(t.threadId, t.createdAt),
  index("idx_portal_messages_tenant").on(t.tenantId, t.createdAt),
]);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Pet = typeof pets.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type WorkflowLog = typeof workflowLogs.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type MembershipPayment = typeof membershipPayments.$inferSelect;
export type PetMembershipEvent = typeof petMembershipEvents.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type RetailProduct = typeof retailProducts.$inferSelect;
export type Timesheet = typeof timesheets.$inferSelect;
export type PetPhoto = typeof petPhotos.$inferSelect;
export type MigrationJob = typeof migrationJobs.$inferSelect;
export type StaffBlockout = typeof staffBlockouts.$inferSelect;
export type GroomStyleNote = typeof groomStyleNotes.$inferSelect;
export type GroomingReport = typeof groomingReports.$inferSelect;
export type GroomStylePreset = typeof groomStylePresets.$inferSelect;
// ─── Family Groups ────────────────────────────────────────────────────────────
export const familyGroups = mysqlTable("family_groups", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type FamilyGroup = typeof familyGroups.$inferSelect;

// ─── SMS Logs ─────────────────────────────────────────────────────────────────
export const smsLogs = mysqlTable("sms_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  clientId: int("client_id").references(() => clients.id),
  appointmentId: int("appointment_id").references(() => appointments.id),
  toNumber: varchar("to_number", { length: 30 }).notNull(),
  body: text("body").notNull(),
  twilioSid: varchar("twilio_sid", { length: 64 }),
  status: mysqlEnum("status", ["sent", "delivered", "failed", "pending", "received"]).default("pending").notNull(),
  type: mysqlEnum("type", ["reminder", "confirmation", "ready_pickup", "payment_failed", "tracker", "custom", "campaign", "inbound"]).default("custom").notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
  replyIntent: mysqlEnum("reply_intent", ["confirm", "cancel", "unknown"]),
  processedAt: timestamp("processed_at"),
  readAt: timestamp("read_at"),
  /** Who opened it. Distinct from processedByUserId, which is who actioned a review. */
  readByUserId: int("read_by_user_id"),
  reviewAction: mysqlEnum("review_action", ["confirm", "cancel"]),
  processedByUserId: int("processed_by_user_id").references(() => users.id),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (t) => [index("idx_sms_tenant").on(t.tenantId), index("idx_sms_client").on(t.clientId)]);

export type SmsLog = typeof smsLogs.$inferSelect;

// ─── Missed Calls (landline voicemail-to-text, via Twilio) ────────────────────
/**
 * A starred conversation. Keyed by the thread key getThreads groups on:
 * "client:<id>", or "number:<phone>" when the number is not a client.
 * Starred is the presence of the row — unstarring deletes it.
 */
/**
 * One mass text send. requestId is generated by the browser and unique per
 * tenant, so a retried request resumes the existing batch rather than
 * texting everyone twice.
 */
export const massTextBatches = mysqlTable("mass_text_batches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  requestId: varchar("request_id", { length: 64 }).notNull(),
  body: text("body").notNull(),
  audience: text("audience"),
  status: mysqlEnum("status", ["sending", "complete", "failed"]).default("sending").notNull(),
  sentByUserId: int("sent_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => [uniqueIndex("uq_mass_text_batches_request").on(t.tenantId, t.requestId)]);

/**
 * Who a batch is going to. Written as "pending" BEFORE anything is sent,
 * so a crash still leaves the intended list; resuming skips "sent".
 */
export const massTextRecipientRows = mysqlTable("mass_text_recipients", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batch_id").notNull(),
  clientId: int("client_id"),
  phone: varchar("phone", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
}, (t) => [uniqueIndex("uq_mass_text_recipients_batch_phone").on(t.batchId, t.phone)]);

export const messageThreadStars = mysqlTable("message_thread_stars", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  threadKey: varchar("thread_key", { length: 80 }).notNull(),
  starredByUserId: int("starred_by_user_id"),
  starredAt: timestamp("starred_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_message_thread_stars_tenant_key").on(t.tenantId, t.threadKey)]);

export const missedCalls = mysqlTable("missed_calls", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  clientId: int("client_id").references(() => clients.id),
  // The specific person who called, when it's a secondary contact (e.g. a
  // client's spouse) rather than the client themselves \u2014 clientId still
  // points at the household/client record so their pets resolve correctly,
  // but the client's own name shouldn't overwrite who was actually on the
  // phone. Null when the caller was the client, or unrecognised.
  callerName: varchar("caller_name", { length: 255 }),
  fromNumber: varchar("from_number", { length: 30 }).notNull(),
  recordingUrl: text("recording_url"),
  transcriptText: text("transcript_text"),
  transcriptionStatus: mysqlEnum("transcription_status", ["pending", "completed", "failed"]).default("pending").notNull(),
  twilioCallSid: varchar("twilio_call_sid", { length: 64 }),
  readAt: timestamp("read_at"),
  /** Who opened it — accountability for a voicemail looked at but not returned. */
  readByUserId: int("read_by_user_id"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
}, (t) => [index("idx_missed_calls_tenant").on(t.tenantId), index("idx_missed_calls_client").on(t.clientId)]);

export type MissedCall = typeof missedCalls.$inferSelect;

// ─── Store Credit (client prepaid balance, ledger-based) ──────────────────────
export const storeCreditTransactions = mysqlTable("store_credit_transactions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // +ve = credit added, -ve = credit used
  type: mysqlEnum("type", ["credit_added", "appointment_deduction", "refund", "adjustment"]).notNull(),
  method: varchar("method", { length: 50 }), // cash, bank_transfer, card, other — only set for credit_added
  appointmentId: int("appointment_id").references(() => appointments.id),
  note: text("note"),
  createdByUserId: int("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_store_credit_tenant_client").on(t.tenantId, t.clientId),
]);

export type StoreCreditTransaction = typeof storeCreditTransactions.$inferSelect;

// ─── Appointment payments (split payments) ────────────────────────────────────
// One row per transaction, so a booking can be settled in more than one go:
// part cash part card, a deposit then the balance, or the two owners of a
// two-dog booking each paying for their own dog. A multi-dog booking is
// several `appointments` rows sharing a sessionId, each with its own price, so
// paying per dog needs no extra structure here.
//
// `clientId` is the PAYER, normally the appointment's client but not always.
// `amount` may be negative: that is a refund, kept as its own row rather than
// by editing the original, so the counter's history survives.
//
// appointments.paymentStatus is DERIVED from the sum of these rows - see
// shared/splitPayments.ts. Never set it by hand.
export const appointmentPayments = mysqlTable("appointment_payments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  appointmentId: int("appointment_id").notNull().references(() => appointments.id),
  clientId: int("client_id").notNull().references(() => clients.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: mysqlEnum("method", ["cash", "eftpos", "card", "stripe", "bank_transfer", "store_credit", "other"]).notNull(),
  /** Stripe payment intent, receipt number, or whatever ties it to the till. */
  reference: varchar("reference", { length: 255 }),
  note: varchar("note", { length: 255 }),
  recordedByUserId: int("recorded_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_appointment_payments_appointment").on(t.appointmentId),
  index("idx_appointment_payments_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_appointment_payments_client").on(t.clientId),
]);

export type AppointmentPayment = typeof appointmentPayments.$inferSelect;

// ─── Client-side error/failure diagnostics ────────────────────────────────────
// Captures the kinds of failure that are otherwise invisible: a blank page
// (bundle failed to load/parse before React ever ran, so no in-app error is
// possible), a React render crash, or an unhandled JS exception. Reported by
// a small inline script in index.html that runs independently of the main
// bundle, plus a global window.onerror/unhandledrejection handler and the
// top-level ErrorBoundary — see client/src/main.tsx and ErrorBoundary.tsx.
export const clientErrorLogs = mysqlTable("client_error_logs", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["stuck_loading", "window_error", "unhandled_rejection", "react_error_boundary"]).notNull(),
  message: text("message"),
  stack: text("stack"),
  url: varchar("url", { length: 512 }),
  userAgent: varchar("user_agent", { length: 512 }),
  connectionType: varchar("connection_type", { length: 30 }), // navigator.connection?.effectiveType, e.g. "3g", "4g" — helps confirm/rule out a network cause
  msSincePageLoad: int("ms_since_page_load"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientErrorLog = typeof clientErrorLogs.$inferSelect;

// ─── Missed-call auto-text ledger (once per phone number, enforced by the DB) ─
// One row per phone number that has been sent the missed-call auto-reply. The
// UNIQUE key on (tenant_id, phone_e164) is what guarantees the text goes out
// at most once: the voice-no-answer handler inserts the claim BEFORE sending
// and only sends if the insert won, so a duplicate-key error is a definitive
// "already texted" regardless of webhook retries, concurrent calls or
// restarts. See drizzle/0060_missed_call_auto_texts.sql for why the previous
// sms_logs body-scan could not provide that guarantee.
export const missedCallAutoTexts = mysqlTable("missed_call_auto_texts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1),
  phoneE164: varchar("phone_e164", { length: 30 }).notNull(),
  firstCallSid: varchar("first_call_sid", { length: 64 }),
  // "claimed" means the row was written but the send outcome is not known yet
  // (or the process died mid-send). It still blocks further sends, by design:
  // never texting twice matters more here than guaranteeing a single delivery.
  sendStatus: mysqlEnum("send_status", ["claimed", "sent", "failed"]).default("claimed").notNull(),
  twilioSid: varchar("twilio_sid", { length: 64 }),
  errorMessage: text("error_message"),
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_missed_call_auto_text_number").on(t.tenantId, t.phoneE164)]);

export type MissedCallAutoText = typeof missedCallAutoTexts.$inferSelect;

// ─── Agreements ──────────────────────────────────────────────────────────────
/**
 * The agreements a client signs: membership terms, salon policies.
 *
 * Versioned rather than edited in place. A signature has to mean "agreed
 * to these exact words on this date", and editing a document someone has
 * already signed would silently rewrite what they agreed to.
 */
export const agreementDocuments = mysqlTable("agreement_documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: mediumtext("body").notNull(),
  version: int("version").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  requiresSignature: boolean("requires_signature").default(true).notNull(),
  /** MoeGo's own three settings, which the salon already thinks in. */
  requirement: mysqlEnum("requirement", ["sign_once", "every_booking", "manual"]).default("manual").notNull(),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_agreement_documents_slug_version").on(t.tenantId, t.slug, t.version)]);

/** One client agreeing to one version of one document. */
export const agreementSignatures = mysqlTable("agreement_signatures", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  documentId: int("document_id").notNull(),
  documentVersion: int("document_version").notNull(),
  clientId: int("client_id").notNull(),
  signedName: varchar("signed_name", { length: 200 }).notNull(),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  signedIp: varchar("signed_ip", { length: 64 }),
  signedUserAgent: text("signed_user_agent"),
  recordedByUserId: int("recorded_by_user_id"),
}, (t) => [uniqueIndex("uq_agreement_signatures_once").on(t.tenantId, t.documentId, t.documentVersion, t.clientId)]);

export type AgreementDocument = typeof agreementDocuments.$inferSelect;
export type AgreementSignature = typeof agreementSignatures.$inferSelect;

// ─── Client reviews ──────────────────────────────────────────────────────────
/**
 * The salon's rating from the client's side. Not grooming_reports, which
 * is the groomer's assessment of the dog's coat.
 */
export const clientReviews = mysqlTable("client_reviews", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  clientId: int("client_id").notNull(),
  appointmentId: int("appointment_id"),
  rating: int("rating").notNull(),
  comment: text("comment"),
  source: mysqlEnum("source", ["portal", "staff_entered", "imported"]).default("staff_entered").notNull(),
  published: boolean("published").default(false).notNull(),
  recordedByUserId: int("recorded_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientReview = typeof clientReviews.$inferSelect;

// ─── Packages ────────────────────────────────────────────────────────────────
/**
 * A block of grooms bought up front: "5 baths for $200". Distinct from a
 * membership, which bills on a cycle and never runs out.
 */
export const servicePackages = mysqlTable("service_packages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  serviceType: varchar("service_type", { length: 64 }),
  credits: int("credits").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  validForWeeks: int("valid_for_weeks"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * One client's purchase. credits_total is copied at purchase, not joined:
 * changing "5 baths" to "4" next year must not retroactively take a credit
 * from someone who paid for five.
 */
export const clientPackages = mysqlTable("client_packages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  clientId: int("client_id").notNull(),
  packageId: int("package_id").notNull(),
  packageName: varchar("package_name", { length: 200 }).notNull(),
  creditsTotal: int("credits_total").notNull(),
  creditsUsed: int("credits_used").default(0).notNull(),
  pricePaid: decimal("price_paid", { precision: 10, scale: 2 }).notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  status: mysqlEnum("status", ["active", "used_up", "expired", "cancelled"]).default("active").notNull(),
  soldByUserId: int("sold_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Drawing a credit down against an appointment. */
export const clientPackageRedemptions = mysqlTable("client_package_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  clientPackageId: int("client_package_id").notNull(),
  appointmentId: int("appointment_id").notNull(),
  credits: int("credits").default(1).notNull(),
  redeemedByUserId: int("redeemed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_package_redemption_appt").on(t.clientPackageId, t.appointmentId)]);

export type ServicePackage = typeof servicePackages.$inferSelect;
export type ClientPackage = typeof clientPackages.$inferSelect;

// ─── Pet paperwork ───────────────────────────────────────────────────────────
/**
 * Vaccination and form expiry. A row per record rather than columns on
 * pets: a dog has several, each with its own date, and an expired one
 * stays on file as history rather than being overwritten by the renewal.
 */
export const petVaccinations = mysqlTable("pet_vaccinations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  petId: int("pet_id").notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  // mode:"string" so these stay "YYYY-MM-DD" end to end. A JS Date here
  // would be midnight in the server's zone, and "expired" would flip on a
  // different day depending on where the box is.
  administeredOn: date("administered_on", { mode: "string" }),
  expiresOn: date("expires_on", { mode: "string" }),
  documentUrl: text("document_url"),
  verifiedAt: timestamp("verified_at"),
  verifiedByUserId: int("verified_by_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PetVaccination = typeof petVaccinations.$inferSelect;

// ─── Client notes ────────────────────────────────────────────────────────────
/**
 * Notes as a list, with an author. `clients.notes` is a single field
 * everyone overwrites, so the salon loses who said what; it stays as it is
 * and new notes land here.
 */
export const clientNotes = mysqlTable("client_notes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  clientId: int("client_id").notNull(),
  body: text("body").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_client_notes_client").on(t.tenantId, t.clientId)]);

export type ClientNote = typeof clientNotes.$inferSelect;

/**
 * Web Push subscriptions — one row per staff member per device.
 *
 * What makes a notification arrive when Groomigo is closed. The browser's
 * own Notification API only fires from an open page, so before this a
 * phone with the app shut heard nothing about an incoming call.
 *
 * Keyed on a sha256 of the endpoint rather than the endpoint itself: the
 * URL is long enough to run into TiDB's index key length limit, a
 * char(64) never is, and re-subscribing the same device has to update its
 * row or every send reaches that phone twice.
 */
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").default(1).notNull(),
  userId: int("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  /** sha256 of endpoint — the real uniqueness key. See the migration. */
  endpointHash: varchar("endpoint_hash", { length: 64 }).notNull(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  /** So a device is recognisable when someone needs to revoke one. */
  userAgent: varchar("user_agent", { length: 255 }),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  /** Only 404/410 prune; this is how a long-failing device stays visible. */
  failureCount: int("failure_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_push_subscriptions_endpoint").on(t.endpointHash),
  index("idx_push_subs_tenant").on(t.tenantId),
  index("idx_push_subs_user").on(t.userId),
]);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;

/**
 * Extras done on an appointment — the itemised part of an invoice.
 *
 * Price and name are SNAPSHOTS, not joins. A catalogue price is a price
 * list and it changes; an invoice records what was charged on the day.
 * Reading the figure from pricing_services would rewrite every past
 * invoice the next time a price moved.
 */
export const appointmentAddOns = mysqlTable("appointment_add_ons", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").default(1).notNull(),
  appointmentId: int("appointment_id").notNull(),
  /** Kept for reporting; null once a catalogue entry is retired. */
  pricingServiceId: int("pricing_service_id"),
  name: varchar("name", { length: 255 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).default("0.00").notNull(),
  quantity: int("quantity").default(1).notNull(),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_appt_add_ons_appointment").on(t.appointmentId),
  index("idx_appt_add_ons_tenant").on(t.tenantId),
  index("idx_appt_add_ons_service").on(t.pricingServiceId),
]);

export type AppointmentAddOn = typeof appointmentAddOns.$inferSelect;

/**
 * A code sent to an email address, to be proved before a salon is made.
 *
 * /signup is the only public endpoint that creates a tenant. Requiring a
 * working mailbox first turns "a script can fill the database with
 * salons" into "a script needs a mailbox per salon", which is a
 * different kind of effort.
 *
 * Hashed like a password reset token: briefly, this code is enough to
 * create an account.
 */
export const signupVerifications = mysqlTable("signup_verifications", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  /** Five wrong guesses and the row is spent — six digits is a million. */
  attempts: int("attempts").default(0).notNull(),
  verifiedAt: timestamp("verified_at"),
  requestedFrom: varchar("requested_from", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_signup_verifications_email").on(t.email),
  index("idx_signup_verifications_expires").on(t.expiresAt),
]);

export type SignupVerification = typeof signupVerifications.$inferSelect;

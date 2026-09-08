import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
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
  onlineBookingEnabled: boolean("online_booking_enabled").default(false).notNull(),
  onlineBathOnlyDailyLimit: int("online_bath_only_daily_limit").default(3).notNull(),
  onlineBathCapacityPerSlot: int("online_bath_capacity_per_slot").default(3).notNull(),
  onlineBookingSlotMinutes: int("online_booking_slot_minutes").default(30).notNull(),
  onlineBookingLeadHours: int("online_booking_lead_hours").default(24).notNull(),
  stripeBillingMode: mysqlEnum("stripe_billing_mode", ["prototype", "live"]).default("prototype").notNull(),
  stripeConnectedAt: timestamp("stripe_connected_at"),
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
  role: mysqlEnum("role", ["owner", "groomer", "bather", "receptionist", "manager"]).default("groomer").notNull(),
  colourHex: varchar("colour_hex", { length: 7 }).default("#6366f1").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  xeroEmployeeId: varchar("xero_employee_id", { length: 100 }),
  onlineBookable: boolean("online_bookable").default(false).notNull(),
  onlineProfilePhotoUrl: text("online_profile_photo_url"),
  onlineBio: text("online_bio"),
  onlineServices: text("online_services"),
  onlineMaxDogsPerSlot: int("online_max_dogs_per_slot").default(1).notNull(),
  onlineMaxDogsPerDay: int("online_max_dogs_per_day").default(0).notNull(),
  portalStatus: mysqlEnum("portal_status", ["not_invited", "invited", "awaiting_approval", "approved", "revoked"]).default("not_invited").notNull(),
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
  portalPasswordHash: text("portal_password_hash"),
  portalLoginEmail: varchar("portal_login_email", { length: 320 }),
  portalAccountStatus: mysqlEnum("portal_account_status", ["not_enabled", "setup_pending", "active", "revoked"]).default("not_enabled").notNull(),
  portalSetupTokenHash: varchar("portal_setup_token_hash", { length: 64 }),
  portalSetupExpiresAt: timestamp("portal_setup_expires_at"),
  portalLastSignedInAt: timestamp("portal_last_signed_in_at"),
  portalSessionVersion: int("portal_session_version").default(0).notNull(),
  moegoClientId: varchar("moego_client_id", { length: 100 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  alertLevel: mysqlEnum("alert_level", ["ok", "caution", "danger"]).default("ok").notNull(),
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
  notes: text("notes"),
  membershipId: int("membership_id").references(() => memberships.id),
  price: decimal("price", { precision: 10, scale: 2 }),
  status: mysqlEnum("status", ["confirmed", "pending", "cancelled", "no_show"]).default("confirmed").notNull(),
  moegoAppointmentId: varchar("moego_appointment_id", { length: 100 }),
  sessionId: varchar("session_id", { length: 64 }),
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
export const petPhotos = mysqlTable("pet_photos", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  petId: int("pet_id").notNull().references(() => pets.id),
  appointmentId: int("appointment_id").references(() => appointments.id),
  url: text("url").notNull(),
  storageKey: text("storage_key"),
  caption: text("caption"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_blockout_staff").on(t.staffId), index("idx_blockout_tenant_date").on(t.tenantId, t.blockoutDate)]);

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
  reviewAction: mysqlEnum("review_action", ["confirm", "cancel"]),
  processedByUserId: int("processed_by_user_id").references(() => users.id),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (t) => [index("idx_sms_tenant").on(t.tenantId), index("idx_sms_client").on(t.clientId)]);

export type SmsLog = typeof smsLogs.$inferSelect;

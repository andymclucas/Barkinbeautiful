/**
 * Which parts of the platform a staff member may CHANGE.
 *
 * One canonical list, shared by the sidebar, the permission tick boxes and
 * the server guards. The same drift that broke de-shed appointments - a list
 * copied into three places and updated in two - would be worse here, because
 * the failure is silent and it is about access.
 *
 * These grant the right to EDIT. Reading is governed separately by the
 * procedure types in server/_core/trpc.ts; nothing here widens what a
 * restricted staff account can see.
 */

export const STAFF_SECTIONS = [
  { key: "appointments",    label: "Appointments",      path: "/calendar" },
  { key: "workflow",        label: "Workflow",          path: "/workflow" },
  { key: "pricing",         label: "Pricing & Services", path: "/pricing" },
  { key: "memberships",     label: "Memberships",       path: "/memberships" },
  { key: "clients",         label: "Clients",           path: "/clients" },
  { key: "analytics",       label: "Analytics",         path: "/analytics" },
  { key: "staff",           label: "Staff",             path: "/staff" },
  { key: "messages",        label: "Messages",          path: "/messages" },
  // Separate from "messages" on purpose: reading the inbox and texting
  // every client at once are not the same permission, and the second has
  // no undo and a finite SMS balance behind it.
  { key: "mass_text",       label: "Mass Text",         path: "/messages" },
  { key: "email_campaigns", label: "Email Campaigns",   path: "/email-campaigns" },
  { key: "reporting",       label: "Reporting",         path: "/reporting" },
  /**
   * What each groomer is targeted to bring in, and what they actually
   * did. Separate from "analytics" because it is about PEOPLE: a manager
   * runs the floor without needing to see what Ashleigh is measured on.
   * It lived behind canAdministerStaff, which also gates editing someone
   * else's record — two different decisions sharing one switch.
   */
  { key: "revenue_targets", label: "Staff revenue targets", path: "/staff" },
] as const;

export type StaffSection = (typeof STAFF_SECTIONS)[number]["key"];

export const STAFF_SECTION_KEYS: readonly StaffSection[] = STAFF_SECTIONS.map((s) => s.key);

export const isStaffSection = (value: unknown): value is StaffSection =>
  typeof value === "string" && (STAFF_SECTION_KEYS as readonly string[]).includes(value);

export const sectionLabel = (key: StaffSection): string =>
  STAFF_SECTIONS.find((s) => s.key === key)?.label ?? key;

/**
 * Read the stored grant.
 *
 * The column is JSON written by us, but it is still parsed defensively: a
 * half-written value must fail CLOSED, because the alternative is a silent
 * grant of everything.
 */
export function parseSections(value: unknown): StaffSection[] {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<StaffSection>();
  for (const entry of raw) if (isStaffSection(entry)) seen.add(entry);
  // Returned in the canonical order so the UI and the audit trail are stable.
  return STAFF_SECTION_KEYS.filter((k) => seen.has(k));
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export interface StaffGrant {
  /** Whether the person has admin rights at all. */
  isAdmin?: boolean | null;
  /** The sections they may edit. Meaningless unless isAdmin. */
  adminSections?: unknown;
  /** Sections they may open but not change. Edit already implies view. */
  viewSections?: unknown;
}

/**
 * May this person change things in this section?
 *
 * Admin rights alone are not enough: rights are granted, then the sections
 * are ticked. Someone given rights and no sections can change nothing, which
 * is the safe reading of a half-finished grant.
 */
export function canEditSection(grant: StaffGrant | null | undefined, section: StaffSection): boolean {
  if (!grant?.isAdmin) return false;
  return parseSections(grant.adminSections).includes(section);
}

/**
 * May this person OPEN this section, without necessarily changing it?
 *
 * A bather needs the client record to know a dog is nervous and must not
 * be able to rewrite it. Edit implies view, so anything editable is
 * viewable and only the read-only extras are stored separately.
 */
export function canViewSection(grant: StaffGrant | null | undefined, section: StaffSection): boolean {
  if (!grant?.isAdmin) return false;
  if (parseSections(grant.adminSections).includes(section)) return true;
  return parseSections(grant.viewSections).includes(section);
}

/** Everything they may open, edit-able and read-only together. */
export function viewableSections(grant: StaffGrant | null | undefined): StaffSection[] {
  if (!grant?.isAdmin) return [];
  const seen = new Set<StaffSection>([
    ...parseSections(grant.adminSections),
    ...parseSections(grant.viewSections),
  ]);
  return STAFF_SECTION_KEYS.filter((k) => seen.has(k));
}

export type GrantSummary = {
  isAdmin: boolean;
  /** The granted sections, in canonical order. */
  sections: StaffSection[];
  /** Their labels, for rendering. */
  labels: string[];
  /** Every section is granted. */
  all: boolean;
  /** The sections NOT granted, in canonical order. */
  missing: StaffSection[];
  missingLabels: string[];
  /** "Admin rights, every section" or "Admin rights, 4 of 11 sections". */
  headline: string;
};

/**
 * The grant as the staff card shows it: a headline AND the sections.
 *
 * `describeGrant` below collapses everything into one sentence, which the
 * card then truncated — "Admin rights: Appointments, Workflow and 7 m…".
 * That tells you somebody has rights and hides which, so checking what a
 * groomer can change meant opening the dialog for each person in turn.
 *
 * The count is in the headline because "every section" and "10 of 11" look
 * identical as a wall of chips, and the difference between them is the
 * whole question when you are auditing who can change pricing.
 */
export function summariseGrant(grant: StaffGrant | null | undefined): GrantSummary {
  const isAdmin = Boolean(grant?.isAdmin);
  const sections = isAdmin ? parseSections(grant?.adminSections) : [];
  const all = sections.length === STAFF_SECTION_KEYS.length;
  const missing = isAdmin ? STAFF_SECTION_KEYS.filter((k) => !sections.includes(k)) : [];
  const headline = !isAdmin
    ? "No admin rights"
    : sections.length === 0
      ? "Admin rights, no sections yet"
      : all
        ? "Admin rights, every section"
        : `Admin rights, ${sections.length} of ${STAFF_SECTION_KEYS.length} sections`;
  return {
    isAdmin, sections, labels: sections.map(sectionLabel), all, headline,
    missing: [...missing], missingLabels: missing.map(sectionLabel),
  };
}

/**
 * How many absent sections are worth naming outright.
 *
 * At 10 of 11 granted, finding the missing one means comparing two
 * three-row blocks of chips. Saying "not Reporting" answers that in a
 * glance. Past two it stops being shorter than reading the chips.
 */
export const NAME_THE_GAP_UP_TO = 2;

/** For the UI: "Appointments, Clients and 2 more", or "No sections yet". */
export function describeGrant(grant: StaffGrant | null | undefined): string {
  if (!grant?.isAdmin) return "No admin rights";
  const sections = parseSections(grant.adminSections);
  if (sections.length === 0) return "Admin rights, no sections yet";
  if (sections.length === STAFF_SECTION_KEYS.length) return "Admin rights, every section";
  const names = sections.map(sectionLabel);
  if (names.length <= 2) return `Admin rights: ${names.join(" and ")}`;
  return `Admin rights: ${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

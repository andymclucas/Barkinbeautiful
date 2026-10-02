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

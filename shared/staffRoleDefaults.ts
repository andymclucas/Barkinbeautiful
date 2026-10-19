/**
 * What a job title is allowed to do, before anyone changes it.
 *
 * Lauren and Andy set a person's title and the permissions follow from it,
 * rather than eleven tick boxes being set by hand for every new starter —
 * which is how Ashleigh ended up on 10 of 11 sections and Brooklyn on 9,
 * with nobody able to say why the two differed.
 *
 * A default is a STARTING POINT. Every one of these can be overridden per
 * person afterwards; the title just stops the common case needing thought.
 *
 * ## View and edit are different questions
 *
 * A bather must see the client record and the membership to do their job
 * and must not be able to rewrite either. One list per section could not
 * say that, so a role carries two: what they can open, and what they can
 * change. Edit implies view — being able to change something you cannot
 * see is not a permission, it is a bug.
 *
 * ## Creating a client is not gated
 *
 * Whoever answers the phone adds the client, and that includes the
 * bathers. `clients` here means changing an EXISTING client's record.
 * See CLIENT_CREATION_IS_UNGATED below.
 */

import { STAFF_SECTION_KEYS, type StaffSection } from "./staffPermissions";

export const STAFF_ROLES = ["owner", "manager", "groomer", "bather", "receptionist"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);

/**
 * Only the salon's actual owners may hold the Owner title.
 *
 * Enforced on the server against the staff-administrator list rather than
 * taken from the form, because the title carries every permission there
 * is and a dropdown is not a security boundary.
 */
export const OWNER_ROLE: StaffRole = "owner";

/**
 * Adding a client is never gated, for any role.
 *
 * A bather on the front desk at 7am takes a booking from someone who has
 * never been in. Gating that behind the clients permission would mean
 * either giving bathers the right to rewrite every client record, or
 * telling a customer to call back when a groomer is free.
 */
export const CLIENT_CREATION_IS_UNGATED = true;

export type RoleDefaults = {
  /** Sections this role may CHANGE. Implies view. */
  edit: readonly StaffSection[];
  /** Sections this role may open but not change. */
  viewOnly: readonly StaffSection[];
};

const ALL: readonly StaffSection[] = STAFF_SECTION_KEYS;

export const ROLE_DEFAULTS: Record<StaffRole, RoleDefaults> = {
  /** Everything. Restricted to the salon's owners, see OWNER_ROLE. */
  owner: { edit: ALL, viewOnly: [] },

  /**
   * An owner minus the money that is about people.
   *
   * Lauren: "all the same permissions as an owner, but cannot see staff
   * revenue targets". A manager runs the floor; what each groomer is
   * targeted to bring in is between them and the owner, and it can be
   * granted back to a specific manager without changing the title.
   */
  manager: { edit: ALL.filter((s) => s !== "revenue_targets"), viewOnly: [] },

  /**
   * Runs their own book and the salon's day, but not its people.
   *
   * Full authority over clients, appointments, pricing and messaging.
   * No staff section: a groomer cannot change anyone else's details, and
   * does not need to — their own profile is editable by everyone through
   * staff.updateMyProfile, which no permission gates.
   */
  groomer: {
    edit: [
      "appointments", "workflow", "pricing", "memberships", "clients",
      "analytics", "messages", "mass_text", "email_campaigns",
    ],
    viewOnly: ["reporting"],
  },

  /**
   * The floor, and nothing that rewrites a record.
   *
   * They move dogs across the workflow board all day and change
   * appointments as the day slips, so both are full edit. Clients and
   * memberships they can open and read — which they need, to know a dog
   * is nervous or a groom is covered — and cannot change. Adding a new
   * client is not gated for anyone.
   */
  bather: {
    edit: ["appointments", "workflow"],
    viewOnly: ["clients", "memberships"],
  },

  /**
   * Front desk: the diary, the people coming in, and the talking.
   *
   * Not in Lauren's list, but the title exists in the schema and a role
   * with no defaults would silently grant nothing. Modelled on what a
   * receptionist actually does rather than invented: book, re-book,
   * answer messages, take a new client.
   */
  receptionist: {
    edit: ["appointments", "workflow", "clients", "messages"],
    viewOnly: ["memberships", "pricing"],
  },
};

/** The sections a role may change, as a plain array. */
export function defaultEditSections(role: StaffRole): StaffSection[] {
  return [...ROLE_DEFAULTS[role].edit];
}

/**
 * Everything a role may open: what it can change, plus what it can only
 * read. In canonical order, so two roles never disagree about ordering.
 */
export function defaultViewSections(role: StaffRole): StaffSection[] {
  const d = ROLE_DEFAULTS[role];
  const all = new Set<StaffSection>([...d.edit, ...d.viewOnly]);
  return STAFF_SECTION_KEYS.filter((s) => all.has(s));
}

/** Whether this role's default lets it change that section. */
export function roleCanEdit(role: StaffRole, section: StaffSection): boolean {
  return ROLE_DEFAULTS[role].edit.includes(section);
}

/** Whether this role's default lets it open that section at all. */
export function roleCanView(role: StaffRole, section: StaffSection): boolean {
  const d = ROLE_DEFAULTS[role];
  return d.edit.includes(section) || d.viewOnly.includes(section);
}

/**
 * Has somebody been moved off their title's defaults?
 *
 * Shown beside the title so an override is visible rather than something
 * you find by comparing two lists by eye.
 */
export function matchesRoleDefaults(role: StaffRole, sections: readonly StaffSection[]): boolean {
  const expected = defaultEditSections(role);
  if (expected.length !== sections.length) return false;
  const have = new Set(sections);
  return expected.every((s) => have.has(s));
}

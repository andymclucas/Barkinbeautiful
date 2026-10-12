/**
 * Telling someone their admin rights changed.
 *
 * Access changing silently is the problem this solves. Someone finds a menu
 * missing and assumes the app is broken, or keeps rights nobody meant them to
 * have because nothing announced it. Both are worse than an email.
 *
 * The decision and the wording live here, as pure functions, because they are
 * the part worth testing: whether a change is worth an email at all, and
 * whether revoking rights should recite the sections that came with them.
 *
 * Nothing here names a salon. Groomigo is becoming a product sold to other
 * salons, so the caller passes its name in — see the build-for-scale skill.
 */
import { parseSections, sectionLabel, STAFF_SECTION_KEYS, type StaffSection } from "./staffPermissions";

export type AdminGrant = { isAdmin?: boolean | null; adminSections?: unknown };

export type AdminRightsChange = {
  /** Anything at all worth telling them about. */
  changed: boolean;
  grantedAdmin: boolean;
  revokedAdmin: boolean;
  addedSections: StaffSection[];
  removedSections: StaffSection[];
  /** Sections they hold after the change, for the body of the message. */
  sectionsAfter: StaffSection[];
};

/**
 * What actually changed between two grants.
 *
 * Revoking admin deliberately reports NO section changes. The sections are
 * kept in the database so restoring someone brings back what they had, and
 * reciting "you lost Appointments, Clients, Pricing…" alongside "you no
 * longer have admin rights" describes one event as two and invites the reply
 * "so do I still have Clients or not".
 */
export function diffAdminRights(before: AdminGrant, after: AdminGrant): AdminRightsChange {
  const wasAdmin = !!before.isAdmin;
  const isAdmin = !!after.isAdmin;
  const beforeSections = parseSections(before.adminSections);
  const afterSections = parseSections(after.adminSections);

  const grantedAdmin = !wasAdmin && isAdmin;
  const revokedAdmin = wasAdmin && !isAdmin;

  if (revokedAdmin) {
    return { changed: true, grantedAdmin: false, revokedAdmin: true,
      addedSections: [], removedSections: [], sectionsAfter: [] };
  }
  const beforeSet = new Set(beforeSections);
  const afterSet = new Set(afterSections);
  // Canonical order, so the email and the audit note read the same way twice.
  const addedSections = STAFF_SECTION_KEYS.filter((k) => afterSet.has(k) && !beforeSet.has(k));
  const removedSections = STAFF_SECTION_KEYS.filter((k) => beforeSet.has(k) && !afterSet.has(k));

  return {
    changed: grantedAdmin || addedSections.length > 0 || removedSections.length > 0,
    grantedAdmin, revokedAdmin: false, addedSections, removedSections,
    sectionsAfter: afterSections,
  };
}

const list = (keys: StaffSection[]) => {
  const names = keys.map(sectionLabel);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/** One line for the audit trail. Same vocabulary as the email. */
export function describeAdminRightsChange(change: AdminRightsChange): string {
  if (!change.changed) return "No change to admin rights";
  if (change.revokedAdmin) return "Admin rights removed";
  const parts: string[] = [];
  if (change.grantedAdmin) parts.push("Admin rights granted");
  if (change.addedSections.length) parts.push(`gained ${list(change.addedSections)}`);
  if (change.removedSections.length) parts.push(`lost ${list(change.removedSections)}`);
  return parts.join("; ");
}

export type StaffNoticeEmail = { subject: string; html: string };
/** Kept as the old name so existing callers are unchanged. */
export type AdminRightsEmail = StaffNoticeEmail;

/** The salon's own words for a staff role. Not the platform's `users.role`. */
const STAFF_ROLE_LABELS: Record<string, string> = {
  owner: "Owner", manager: "Manager", groomer: "Groomer",
  bather: "Bather", receptionist: "Receptionist",
};
export const staffRoleLabel = (role: string | null | undefined): string =>
  STAFF_ROLE_LABELS[String(role ?? "").trim().toLowerCase()] ?? String(role ?? "").trim() ?? "";

/**
 * One shell for every access notice, so three messages cannot drift into
 * three different voices — and so escaping happens in exactly one place.
 *
 * `bullets` arrive already escaped by their builder, because some of them
 * carry intentional <strong>.
 */
function renderNotice(input: {
  productName: string; headline: string; intro: string;
  bullets: string[]; signInUrl: string; footer?: string;
}): string {
  const { productName, headline, intro, bullets, signInUrl, footer } = input;
  return `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#faf8ff;border-radius:16px">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;margin:0">${escapeHtml(productName)}</p>
        <h1 style="margin:10px 0 14px;font-size:22px;color:#111827">${escapeHtml(headline)}</h1>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6">${intro}</p>
        ${bullets.length ? `<ul style="margin:0 0 20px;padding-left:18px;color:#374151;font-size:15px;line-height:1.7">${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>` : ""}
        <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px">Open ${escapeHtml(productName)}</a>
        <p style="margin:22px 0 0;font-size:13px;color:#6b7280">${escapeHtml(footer ?? "If this wasn't expected, speak to whoever manages the salon — this email is a notification, not something you need to action.")}</p>
      </div>`;
}

/**
 * The salon changed what someone is: groomer to manager, and so on.
 *
 * Worth its own message rather than folding into the admin-rights one,
 * because a role is how the salon describes a person and admin rights are
 * what the software lets them edit. Someone can gain one without the other.
 */
export function buildRoleChangeEmail(input: {
  staffName: string; salonName: string; productName: string;
  actorName: string | null; fromRole: string | null; toRole: string;
  signInUrl: string;
}): StaffNoticeEmail {
  const { staffName, salonName, productName, actorName, fromRole, toRole, signInUrl } = input;
  const headline = `Your role at ${salonName} is now ${staffRoleLabel(toRole)}`;
  const by = actorName ? ` by ${escapeHtml(actorName)}` : "";
  return {
    subject: headline,
    html: renderNotice({
      productName, headline, signInUrl,
      intro: `Hi ${escapeHtml(staffName)}, your role at ${escapeHtml(salonName)} was changed${by}.`,
      bullets: [
        fromRole
          ? `You were <strong>${escapeHtml(staffRoleLabel(fromRole))}</strong> and are now <strong>${escapeHtml(staffRoleLabel(toRole))}</strong>.`
          : `You are now <strong>${escapeHtml(staffRoleLabel(toRole))}</strong>.`,
        "Your role affects where you appear in the diary and what the salon expects of you. It is separate from admin rights, which govern what you can edit.",
      ],
    }),
  };
}

/**
 * Portal access taken away, or given back.
 *
 * Deliberately plain about consequence: somebody whose login stopped working
 * will otherwise assume the system is broken and ring whoever is on the floor.
 */
export function buildPortalAccessEmail(input: {
  staffName: string; salonName: string; productName: string;
  actorName: string | null; action: "revoked" | "restored";
  note?: string | null; signInUrl: string;
}): StaffNoticeEmail {
  const { staffName, salonName, productName, actorName, action, note, signInUrl } = input;
  const revoked = action === "revoked";
  const headline = revoked
    ? `Your ${productName} access at ${salonName} has been turned off`
    : `Your ${productName} access at ${salonName} has been restored`;
  const by = actorName ? ` by ${escapeHtml(actorName)}` : "";
  const bullets = revoked
    ? [
        "You will not be able to sign in from now on.",
        "Your record, your appointments and your grooming history are all kept — nothing has been deleted.",
        ...(note ? [`Note from the salon: ${escapeHtml(note)}`] : []),
      ]
    : ["You can sign in again with your usual email and password.",
       "If you have forgotten it, use the forgotten-password link on the sign-in page."];
  return {
    subject: headline,
    html: renderNotice({
      productName, headline, signInUrl, bullets,
      intro: `Hi ${escapeHtml(staffName)}, your access to ${escapeHtml(salonName)} on ${escapeHtml(productName)} was ${revoked ? "turned off" : "restored"}${by}.`,
      footer: revoked
        ? "If you think this is a mistake, speak to whoever manages the salon."
        : "If this wasn't expected, speak to whoever manages the salon.",
    }),
  };
}

/**
 * The message itself.
 *
 * Says who made the change, because "your access changed" without a name is
 * the kind of notice people ignore or escalate. Says what they can do now
 * rather than only what moved, so they do not have to reconstruct it.
 */
export function buildAdminRightsEmail(input: {
  staffName: string;
  salonName: string;
  productName: string;
  actorName: string | null;
  change: AdminRightsChange;
  signInUrl: string;
}): AdminRightsEmail {
  const { staffName, salonName, productName, actorName, change, signInUrl } = input;
  const by = actorName ? ` by ${escapeHtml(actorName)}` : "";
  const headline = change.revokedAdmin
    ? `Your admin rights at ${salonName} have been removed`
    : change.grantedAdmin
      ? `You've been given admin rights at ${salonName}`
      : `Your admin rights at ${salonName} have changed`;

  const detail: string[] = [];
  if (change.grantedAdmin) detail.push("You now have admin rights.");
  if (change.addedSections.length) detail.push(`You can now edit: <strong>${escapeHtml(list(change.addedSections))}</strong>.`);
  if (change.removedSections.length) detail.push(`You can no longer edit: <strong>${escapeHtml(list(change.removedSections))}</strong>.`);
  if (change.revokedAdmin) {
    detail.push("You no longer have admin rights. Your usual staff access — your calendar, the workflow board and your own profile — is unchanged.");
  } else if (change.sectionsAfter.length) {
    detail.push(`In full, you can edit: ${escapeHtml(list(change.sectionsAfter))}.`);
  } else if (change.grantedAdmin) {
    detail.push("No sections have been ticked yet, so nothing has changed in practice until they are.");
  }

  return {
    subject: headline,
    html: renderNotice({
      productName, headline, signInUrl, bullets: detail,
      intro: `Hi ${escapeHtml(staffName)}, your access at ${escapeHtml(salonName)} was changed${by}.`,
    }),
  };
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The order of the sidebar, and which rows live inside a group.
 *
 * Andy, 05/11/2026, gave the order and the groups by name: three rows on
 * their own, then Financials, Communication and Insights, then Staff and
 * the Christmas countdown.
 *
 * It lives here rather than in DashboardLayout because it is a rule
 * about what the salon's software is FOR — which screens belong
 * together — and because the permission filtering below has to be
 * testable. The component's job is to draw it.
 *
 * ## A group is never a thing you can click to
 *
 * "Financials" is not a page. Every group is a container for rows that
 * ARE pages, so a group with nothing left in it after filtering must
 * disappear rather than sit there opening onto nothing. That is the
 * case that matters: a restricted groomer sees Memberships and not
 * Pricing, so Financials holds one row for them and none of
 * Communication or Insights, and those two must not render at all.
 */

export type SidebarGroupKey = "financials" | "communication" | "insights";

export type SidebarEntry =
  | { kind: "item"; path: string }
  | { kind: "group"; key: SidebarGroupKey; label: string; paths: readonly string[] };

/**
 * The layout as Andy wrote it.
 *
 * Paths, not labels: the label belongs to the nav item itself, and
 * duplicating it here is how the two drift apart.
 */
export const SIDEBAR_LAYOUT: readonly SidebarEntry[] = [
  { kind: "item", path: "/calendar" },
  { kind: "item", path: "/workflow" },
  { kind: "item", path: "/clients" },
  // Daily, and used by the whole floor, so a top-level row rather than
  // inside Financials, which restricted staff never see.
  { kind: "item", path: "/counter" },
  { kind: "group", key: "financials", label: "Financials", paths: ["/memberships", "/pricing"] },
  {
    kind: "group",
    key: "communication",
    label: "Communication",
    paths: ["/messages", "/portal-messages", "/email-campaigns"],
  },
  { kind: "group", key: "insights", label: "Insights", paths: ["/analytics", "/reporting"] },
  { kind: "item", path: "/staff" },
  // Owners only (canAdministerStaff); everyone else never has it permitted.
  { kind: "item", path: "/issues" },
  { kind: "item", path: "/christmas" },
];

/**
 * The layout with everything this person cannot see taken out.
 *
 * `permitted` is the set of paths the sidebar would have drawn as flat
 * rows, which is already the answer to every permission question —
 * restricted staff, additive grants, and whether the Christmas row is
 * in season. This function must not re-derive any of that; it only
 * arranges.
 *
 * Anything permitted that the layout does not mention is appended as a
 * plain row rather than dropped. A new page added to the nav and not to
 * this list should appear somewhere obvious, not vanish.
 */
export function sidebarEntriesFor(permitted: ReadonlySet<string>): SidebarEntry[] {
  const placed = new Set<string>();
  const entries: SidebarEntry[] = [];

  for (const entry of SIDEBAR_LAYOUT) {
    if (entry.kind === "item") {
      if (!permitted.has(entry.path)) continue;
      placed.add(entry.path);
      entries.push(entry);
      continue;
    }
    const paths = entry.paths.filter((path) => permitted.has(path));
    if (paths.length === 0) continue;
    for (const path of paths) placed.add(path);
    entries.push({ ...entry, paths });
  }

  for (const path of permitted) {
    if (!placed.has(path)) entries.push({ kind: "item", path });
  }
  return entries;
}

/** The group holding this path, if any — used to open it on the page it is on. */
export function groupContaining(path: string): SidebarGroupKey | null {
  for (const entry of SIDEBAR_LAYOUT) {
    if (entry.kind === "group" && entry.paths.includes(path)) return entry.key;
  }
  return null;
}

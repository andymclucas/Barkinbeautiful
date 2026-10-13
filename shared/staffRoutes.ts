/**
 * Which pages a restricted `staff` account may open.
 *
 * `users.role === "staff"` is the confined account: a groomer or bather who
 * works the floor and has no business in billing, analytics or settings.
 * Anything outside this list bounces them back to the diary.
 *
 * It lives here because DashboardLayout carried the list TWICE — once in
 * the redirect effect and once in the render guard — and the contract test
 * pinned only one of the two copies. A list in two places with one guard on
 * it is a list that will eventually disagree with itself.
 *
 * `/clients` joined on 13/10/2026. Andy asked for staff to be able to add a
 * client and a dog, and clients.create, clients.list and pets.create were
 * opened to operationalProcedure for it — but the page itself was still
 * bouncing them to /calendar, so the permission change did nothing on its
 * own. The procedures and the route have to move together.
 */
export const STAFF_OPERATION_ROUTES: readonly string[] = [
  "/calendar",
  "/workflow",
  "/memberships",
  "/clients",
];

/**
 * Is this path open to a restricted staff account?
 *
 * Compares the path only — a query string or a trailing slash is still the
 * same page, and bouncing someone off "/clients?page=2" would be a bug
 * nobody would think to look for.
 */
export function isStaffOperationRoute(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0].split("#")[0].replace(/\/+$/, "");
  return STAFF_OPERATION_ROUTES.includes(path === "" ? "/" : path);
}

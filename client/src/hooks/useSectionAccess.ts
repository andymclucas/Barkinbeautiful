import { trpc } from "@/lib/trpc";
import { canEditSection, canViewSection, type StaffSection } from "@shared/staffPermissions";

/**
 * May the person at this screen change this part of the salon?
 *
 * One hook so a page asks the question the same way the server answers
 * it. Without it the pattern becomes "render the button and let the
 * mutation fail", which is how a bather ends up tapping Save on a client
 * record and getting a permission error for something they were never
 * meant to be offered.
 *
 * It is a HINT, not the gate. The gate is `enforceSection` in
 * server/_core/trpc.ts, which the browser cannot talk its way past.
 * Hiding a button is a courtesy to the person using the app; it is not
 * what stops them.
 *
 * Defaults to ALLOWED while the profile is loading and for anyone with
 * no grant, matching the server exactly: no grant means no restriction,
 * so a page must not flash read-only at an owner on first paint.
 */
export function useSectionAccess(section: StaffSection): {
  canEdit: boolean;
  canView: boolean;
  loading: boolean;
} {
  const { data: me, isLoading } = trpc.staff.getMyProfile.useQuery();

  // No staff row, or no grant, is the unrestricted case on the server too.
  if (isLoading || !me || !me.isAdmin) {
    return { canEdit: true, canView: true, loading: isLoading };
  }
  return {
    canEdit: canEditSection(me, section),
    canView: canViewSection(me, section),
    loading: false,
  };
}

/** Just the editable half, for the common `disabled={!canEdit}` case. */
export function useCanEditSection(section: StaffSection): boolean {
  return useSectionAccess(section).canEdit;
}

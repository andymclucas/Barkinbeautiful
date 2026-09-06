/**
 * Treat legacy/migrated missing active flags as active. A staff record should
 * only be hidden when the backend explicitly marks it false or zero.
 */
export function isActiveStaffValue(value: unknown): boolean {
  return value !== false && value !== 0 && value !== "0";
}

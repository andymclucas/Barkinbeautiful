export function getBookingGroomerDisplayName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

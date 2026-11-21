/**
 * The salon's own name and logo, for every screen that shows a masthead.
 *
 * The staff sidebar, the TV board, the wall display and the online booking
 * page all drew `/barkin_beautiful_logo.png` and the words "Barkin'
 * Beautiful" whatever salon was signed in. Fine while there was one salon;
 * wrong the moment Groomigo has a second, whose staff, clients and wall
 * screen would all wear another business's name. Each salon uploads its
 * own logo in Settings (tenants.logoUrl), so that is what is shown, and a
 * salon that has not uploaded one gets its initials rather than somebody
 * else's picture.
 */
export type SalonBrand = { name?: string | null; logoUrl?: string | null };

/** The salon's name, or the fallback when it has none (or none yet). */
export function salonName(brand: SalonBrand | null | undefined, fallback = "Your salon"): string {
  const name = brand?.name?.trim();
  return name ? name : fallback;
}

/** The uploaded logo, or null: never a stand-in image belonging to another salon. */
export function salonLogoSrc(brand: SalonBrand | null | undefined): string | null {
  const url = brand?.logoUrl?.trim();
  return url ? url : null;
}

/** Up to two initials for the badge shown when there is no logo. */
export function salonInitials(name: string | null | undefined): string {
  const words = (name ?? "").replace(/['’]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(0, 2).map(word => word[0]!.toUpperCase()).join("");
}

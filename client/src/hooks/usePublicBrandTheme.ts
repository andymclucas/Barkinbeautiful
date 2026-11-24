/**
 * Brand the pages a salon's own customers land on.
 *
 * The client portal, the grooming card, online booking and the
 * membership sign-up never mount DashboardLayout, so the theme it
 * applies never reached them: a salon could set their colours and
 * watch the staff app change while the page they actually send to
 * clients stayed stock Groomigo. These are the surfaces branding
 * matters most on, so they fetch it themselves.
 *
 * Reads the public branding endpoint, which carries the salon's name,
 * logo and colours and nothing else — these pages are reachable
 * without a staff session, and some without any session.
 *
 * Returns the salon's name and logo as well, since a page that wants
 * the colours usually wants the masthead too.
 */

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { applyBrandTheme } from "@/lib/brandTheme";
import { staffBrand } from "@shared/brandPalette";

/**
 * `staff: true` is for the staff sign-in page, which sits in front of the
 * staff app and so follows the same Groomigo / My brand switch. Every
 * other caller is a page a salon's clients see, and keeps the salon's own
 * colours whichever theme the staff app wears.
 */
export function usePublicBrandTheme(tenantId = 1, options: { staff?: boolean } = {}) {
  const { data } = trpc.settings.getPublicBranding.useQuery({ tenantId });

  useEffect(() => {
    // Nothing is applied until the salon's colours arrive, so the page
    // renders in the stock palette first rather than flashing a theme
    // it is about to replace.
    if (!data) return;
    const colours = options.staff
      ? staffBrand(data)
      : { primary: data.brandPrimary, accent: data.brandAccent, sidebar: data.brandSidebar };
    return applyBrandTheme({
      primary: colours.primary,
      accent: colours.accent,
      sidebar: colours.sidebar,
      font: data.brandFont,
    });
  }, [data, options.staff]);

  return { salonName: data?.name ?? null, logoUrl: data?.logoUrl ?? null };
}

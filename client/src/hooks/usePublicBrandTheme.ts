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

export function usePublicBrandTheme(tenantId = 1) {
  const { data } = trpc.settings.getPublicBranding.useQuery({ tenantId });

  useEffect(() => {
    // Nothing is applied until the salon's colours arrive, so the page
    // renders in the stock palette first rather than flashing a theme
    // it is about to replace.
    if (!data) return;
    return applyBrandTheme({
      primary: data.brandPrimary,
      accent: data.brandAccent,
      sidebar: data.brandSidebar,
      font: data.brandFont,
    });
  }, [data]);

  return { salonName: data?.name ?? null, logoUrl: data?.logoUrl ?? null };
}

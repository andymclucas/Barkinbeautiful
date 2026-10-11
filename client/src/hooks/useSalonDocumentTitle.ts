import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { salonDocumentTitle } from "@shared/salonTitle";

/**
 * Puts the salon's own name in the browser tab: "Groomigo — Barkin Beautiful".
 *
 * The name comes from the tenant rather than a constant, because Groomigo is
 * multi-tenant and a second salon must not see this one's name in its tab.
 *
 * Only called from the staff shell. getTenantInfo is operationalProcedure, so
 * a client on the portal or a grooming-card link would get a 401 and a line of
 * console noise for a cosmetic nicety; those pages keep the plain "Groomigo"
 * from index.html.
 */
export function useSalonDocumentTitle() {
  const { data } = trpc.settings.getTenantInfo.useQuery(
    {},
    {
      // The salon's name changes about never. Don't re-ask on every mount.
      staleTime: 60 * 60 * 1000,
      retry: false,
    },
  );

  useEffect(() => {
    document.title = salonDocumentTitle(data?.name);
  }, [data?.name]);
}

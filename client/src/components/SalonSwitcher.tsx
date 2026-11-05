import { Building2, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { readActiveSalon, writeActiveSalon } from "@/lib/activeSalon";

/**
 * Moving between salons, for somebody who runs more than one.
 *
 * Lauren owns Barkin' Beautiful and, from 23/11/2026, The Pet Pad. They are
 * separate books — own clients, pets, staff, calendar, pricing and
 * subscription — so this moves between two businesses rather than two
 * rooms of one.
 *
 * ## Invisible for everyone else
 *
 * `showSwitcher` comes from the server and is false for a single-salon
 * account, which is almost all of them. A dropdown with one entry reads as
 * a setting somebody has failed to finish configuring, and this sits in
 * the header of every page.
 *
 * ## Switching reloads the page, on purpose
 *
 * Every cached query in the app holds the old salon's data — clients,
 * appointments, takings, the board. Invalidating them would leave React
 * Query serving yesterday's salon from cache while the new name sat in the
 * header, which for a page about money is not a cosmetic problem.
 *
 * A reload costs a second on an action taken a handful of times a day and
 * removes the entire class of bug. It is the honest version of what
 * switching actually is: a different business.
 */
export function SalonSwitcher() {
  const { data } = trpc.salons.mine.useQuery(undefined, {
    // The answer changes only when somebody is given another salon.
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState(false);

  if (!data?.showSwitcher) return null;

  const active = data.salons.find((s) => s.id === data.activeTenantId) ?? data.salons[0];

  const choose = (tenantId: number) => {
    if (tenantId === data.activeTenantId) { setOpen(false); return; }
    writeActiveSalon(tenantId);
    // Full reload: see the note above. Nothing cached survives the move.
    window.location.assign("/");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 max-w-[14rem] items-center gap-2 rounded-lg border border-foreground/20 bg-card px-2.5 text-sm font-medium shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current salon: ${active?.name ?? "none"}. Change salon`}
      >
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">{active?.name ?? "Choose a salon"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* Click-away. Covers the page so the next click closes the menu
              rather than doing two things at once. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute left-0 z-50 mt-1 min-w-[14rem] overflow-hidden rounded-xl border bg-card p-1 shadow-xl"
          >
            {data.salons.map((salon) => {
              const isActive = salon.id === data.activeTenantId;
              return (
                <li key={salon.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => choose(salon.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary/10 ${isActive ? "font-semibold" : ""}`}
                  >
                    <Check className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{salon.name}</span>
                    {/* A salon that is not paying is a thing its owner needs
                        to see from anywhere, not only on its own billing
                        page — they may be standing in the other one. */}
                    {salon.subscriptionStatus === "past_due" && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-400 dark:text-amber-300 dark:ring-amber-700">
                        PAST DUE
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Keeps a stale tab honest: if the server moved us, match it. */
export function useActiveSalonSync(activeTenantId: number | null | undefined) {
  const stored = readActiveSalon();
  if (
    typeof activeTenantId === "number"
    && stored !== null
    && stored !== activeTenantId
  ) {
    /*
     * The server ignored what this tab asked for — the grant was removed,
     * or the salon was deleted. Writing the server's answer back stops the
     * tab asking for something it cannot have on every request, and stops
     * the header disagreeing with the data underneath it.
     */
    writeActiveSalon(activeTenantId);
  }
}

/**
 * One search box, on every screen.
 *
 * Andy, 03/11/2026: "an overall 'search' button at the top which shows
 * regardless of the navigation tab. Search by any detail at all - also
 * can show appts and workflow items."
 *
 * Opens on the button, on Ctrl/Cmd-K, and on "/" — the last one because
 * the salon iPad has no comfortable modifier key and staff type one
 * handed while holding a dog.
 *
 * Results are debounced, not fetched per keystroke: the query hits
 * three tables with LIKEs and the salon has 10,000 clients.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CalendarDays, Dog, Loader2, Search, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { groupLabel, isOnTheFloor, type SearchHit, type SearchKind } from "@shared/globalSearch";

const ICON: Record<SearchKind, typeof Dog> = {
  pet: Dog,
  client: User,
  appointment: CalendarDays,
};

/** Waits for a pause in typing before letting the value through. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const debounced = useDebounced(query, 220);

  const { data, isFetching } = trpc.search.everything.useQuery(
    { query: debounced },
    // min(2) on the server, so asking with fewer is a guaranteed error.
    { enabled: open && debounced.trim().length >= 2, staleTime: 15_000 },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typingHere =
        e.target instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" is only a shortcut when it is not a character somebody is
      // trying to type into a field.
      if (e.key === "/" && !typingHere && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const grouped = useMemo(() => {
    const out: Record<SearchKind, SearchHit[]> = { pet: [], client: [], appointment: [] };
    for (const hit of data ?? []) out[hit.kind].push(hit);
    return out;
  }, [data]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    navigate(hit.href);
  };

  const short = debounced.trim().length > 0 && debounced.trim().length < 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search everything"
        className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent sm:px-3"
      >
        <Search className="h-4 w-4 shrink-0" />
        {/* The word and the hint are for a desk; on a phone the icon
            alone has to carry it, which is what aria-label is for. */}
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border bg-muted px-1 text-[10px] font-medium md:inline">⌘K</kbd>
      </button>

      {/* shouldFilter={false}: the server has already decided what
          matches and in what order. Leaving cmdk's own filter on would
          drop every result whose match is not in the visible text — a
          client found by phone number or address — and the item values
          are stable ids, which match nothing at all. */}
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Dog, client, phone, email, address…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {/* cmdk filters its own items by default, which would filter
              OUT a result matched on a phone number or an address that
              is not in the visible text. The server has already decided
              what matches, so this list must not second-guess it — see
              shouldFilter={false} on the dialog below. */}
          {short && <CommandEmpty>Keep typing…</CommandEmpty>}
          {!short && isFetching && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!short && !isFetching && (data?.length ?? 0) === 0 && debounced.trim().length >= 2 && (
            <CommandEmpty>Nothing matches “{debounced.trim()}”.</CommandEmpty>
          )}

          {(["pet", "client", "appointment"] as SearchKind[]).map((kind) => {
            const items = grouped[kind];
            if (items.length === 0) return null;
            const Icon = ICON[kind];
            return (
              <CommandGroup key={kind} heading={groupLabel(kind, items.length)}>
                {items.map((hit) => (
                  <CommandItem
                    key={`${hit.kind}-${hit.id}`}
                    value={`${hit.kind}-${hit.id}`}
                    onSelect={() => go(hit)}
                    className="gap-2.5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="ml-2 text-xs text-muted-foreground">{hit.subtitle}</span>
                      )}
                    </span>
                    {/* Why this row is here, when the reason is not the
                        name: "0412 345 678", "Cavoodle". */}
                    {hit.matchedOn && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{hit.matchedOn}</span>
                    )}
                    {isOnTheFloor(hit.workflowState) && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        In salon
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export default GlobalSearch;

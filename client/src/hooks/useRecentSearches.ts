import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { readActiveSalon } from "@/lib/activeSalon";
import {
  parseRecentSearches, recentSearchStorageKey, rememberSearch, type RecentSearch,
} from "@shared/recentSearches";

/**
 * The last five results opened from a search box (Andy, 12/11/2026), kept
 * in this browser. Per person and per salon — see recentSearchStorageKey.
 *
 * localStorage, wrapped: a private window or blocked site data throws, and
 * a search box that forgets is fine where one that crashes is not.
 */
export function useRecentSearches(box: "global" | "clients") {
  const { user } = useAuth();
  const key = recentSearchStorageKey(box, user?.id ?? null, readActiveSalon());
  const [recent, setRecent] = useState<RecentSearch[]>(() => read(key));

  // A different person signing in, or a salon switch, is a different list.
  useEffect(() => setRecent(read(key)), [key]);

  const remember = useCallback((entry: Omit<RecentSearch, "at">) => {
    // Re-read rather than trusting state: the other search box, or another
    // tab, may have written since this one last looked.
    const next = rememberSearch(read(key), { ...entry, at: Date.now() });
    write(key, next);
    setRecent(next);
  }, [key]);

  const clear = useCallback(() => {
    write(key, []);
    setRecent([]);
  }, [key]);

  /** Re-read on open, so a result opened from elsewhere shows up. */
  const refresh = useCallback(() => setRecent(read(key)), [key]);

  return { recent, remember, clear, refresh };
}

function read(key: string): RecentSearch[] {
  try {
    return parseRecentSearches(localStorage.getItem(key));
  } catch {
    return [];
  }
}

function write(key: string, list: RecentSearch[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage blocked: the list simply is not kept */
  }
}

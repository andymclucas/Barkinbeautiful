import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { DEFAULT_TIMEZONE, safeTimeZone } from "@shared/auditTimestamp";

/**
 * Which clock the signed-in user sees.
 *
 * Resolution order, first one that is set and valid:
 *   1. the user's own choice, picked when they set up their account
 *   2. the salon's `tenants.timezone`
 *   3. Australia/Brisbane
 *
 * Step 2 matters as much as step 1: the platform hardcoded Brisbane in 124
 * places while `tenants.timezone` sat unread, so a salon anywhere else was
 * simply wrong. Falling back to the salon means existing accounts — which have
 * no timezone of their own — keep working, and a salon that changes its zone
 * moves everyone who has not overridden it.
 *
 * NOTE on what this does and does not change. This governs how instants are
 * RENDERED. It deliberately does not touch how the server buckets a day:
 * "which appointments are today" stays salon-side, because two staff in
 * different zones must not see different sets of dogs on the board.
 */

/**
 * The active zone, held at module scope so that plain helper functions — the
 * ones that are not React components and cannot call a hook — can format
 * correctly too. `useTimezoneSync()` keeps it current; it is written once when
 * the signed-in user resolves and then essentially never changes.
 *
 * This lives in a CLIENT module on purpose. The same trick in `shared/` would
 * be a cross-request leak on the server, where one user's zone could end up in
 * another user's reminder email. Server code passes its zone explicitly.
 */
let activeTimeZone: string = DEFAULT_TIMEZONE;

export function getActiveTimeZone(): string {
  return activeTimeZone;
}

export function setActiveTimeZone(zone: string | null | undefined): void {
  activeTimeZone = safeTimeZone(zone);
}

/** IANA zones offered in the picker, grouped for a sane menu. */
export const TIMEZONE_OPTIONS: { group: string; zones: string[] }[] = [
  {
    group: "Australia",
    zones: [
      "Australia/Brisbane",
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Adelaide",
      "Australia/Perth",
      "Australia/Darwin",
      "Australia/Hobart",
    ],
  },
  { group: "New Zealand", zones: ["Pacific/Auckland"] },
  {
    group: "Asia",
    zones: ["Asia/Singapore", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Manila", "Asia/Kolkata", "Asia/Dubai"],
  },
  {
    group: "Europe",
    zones: ["Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin"],
  },
  {
    group: "Americas",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
      "America/Sao_Paulo",
    ],
  },
  { group: "Other", zones: ["UTC"] },
];

/** "Australia/Perth" -> "Perth" — the city, which is what people recognise. */
export function timezoneCityLabel(zone: string): string {
  const city = zone.split("/").pop() ?? zone;
  return city.replace(/_/g, " ");
}

/** "Australia/Perth" -> "AWST", the abbreviation shown beside a time. */
export function timezoneAbbreviation(zone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: safeTimeZone(zone),
      timeZoneName: "short",
    }).formatToParts(at);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Perth · AWST (UTC+8)" — enough to pick the right one from a list. */
export function timezoneOptionLabel(zone: string, at: Date = new Date()): string {
  const abbr = timezoneAbbreviation(zone, at);
  return abbr ? `${timezoneCityLabel(zone)} · ${abbr}` : timezoneCityLabel(zone);
}

/** The viewer's best guess, used to preselect the picker at sign-up. */
export function detectBrowserTimezone(): string {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Call once high in the tree. Mirrors the resolved zone into module scope for
 * the non-component helpers, and returns it.
 */
export function useTimezoneSync(): string {
  const { timezone } = useTimezone();
  if (getActiveTimeZone() !== timezone) setActiveTimeZone(timezone);
  useEffect(() => { setActiveTimeZone(timezone); }, [timezone]);
  return timezone;
}

/**
 * The effective timezone for the signed-in user, plus formatters bound to it.
 *
 * `timeWithZone` labels its output with the zone abbreviation, so a time can
 * always say which clock it is: "7:00 am AWST", not a bare "7:00 am".
 */
export function useTimezone() {
  const { user } = useAuth();
  const { data: tenant } = trpc.settings.getTenantInfo.useQuery({ tenantId: 1 }, { enabled: !!user });

  const timezone = safeTimeZone(
    (user as { timezone?: string | null } | null | undefined)?.timezone ?? tenant?.timezone ?? DEFAULT_TIMEZONE,
  );

  return useMemo(() => {
    const format = (value: number | string | Date | null | undefined, opts: Intl.DateTimeFormatOptions, fallback = "--") => {
      if (value === null || value === undefined || value === "") return fallback;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return fallback;
      return new Intl.DateTimeFormat("en-AU", { timeZone: timezone, ...opts }).format(date);
    };

    return {
      timezone,
      abbreviation: timezoneAbbreviation(timezone),
      label: timezoneOptionLabel(timezone),
      /** Whether the user is on a different clock from the salon. */
      differsFromSalon: !!tenant?.timezone && tenant.timezone !== timezone,
      salonTimezone: safeTimeZone(tenant?.timezone ?? DEFAULT_TIMEZONE),

      /** "8:00 am" */
      time: (value: number | string | Date | null | undefined) =>
        format(value, { hour: "numeric", minute: "2-digit", hour12: true }),
      /** "8:00 am AWST" — use wherever the clock could be ambiguous. */
      timeWithZone: (value: number | string | Date | null | undefined) =>
        format(value, { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }),
      /** "Fri, 25 Sep 2026" */
      date: (value: number | string | Date | null | undefined) =>
        format(value, { day: "numeric", month: "short", year: "numeric" }),
      /** "Friday 25 September 2026" */
      longDate: (value: number | string | Date | null | undefined) =>
        format(value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      /** "25 Sep 2026, 8:00 am" */
      dateTime: (value: number | string | Date | null | undefined) =>
        format(value, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }),
      /** Escape hatch for a one-off shape. */
      format,
    };
  }, [timezone, tenant?.timezone]);
}

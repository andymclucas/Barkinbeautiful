import { describeViewers, type PresenceViewer } from "@shared/presence";

/**
 * "Lauren also has this open", with faces.
 *
 * Andy, 22/10/2026, on going to add Jessie's add-ons: "not sure if
 * someone else is doing this at the same time... just some sort of live
 * identifier that something is happening."
 *
 * Deliberately quiet. It is amber rather than red because nothing is
 * wrong — two people on one record is normal in a salon and usually
 * resolves itself. A red banner would train everyone to dismiss it, and
 * the one time it mattered they would dismiss that too.
 *
 * It renders nothing when nobody else is there, so the dialog does not
 * carry an empty strip around all day.
 */
export function PresenceIndicator({
  viewers,
  className = "",
}: {
  viewers: readonly PresenceViewer[];
  className?: string;
}) {
  if (viewers.length === 0) return null;

  // Four faces is as many as fit before they stop being faces. The rest
  // are a count, and the sentence below names them anyway.
  const shown = viewers.slice(0, 4);
  const extra = viewers.length - shown.length;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 dark:border-amber-800 dark:bg-amber-950/50 ${className}`}
      data-testid="presence"
      role="status"
      aria-live="polite"
    >
      <div className="flex -space-x-1.5">
        {shown.map((v) => (
          <span
            key={v.userId}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-amber-50 dark:ring-amber-950"
            title={v.name}
            data-testid="presence-avatar"
          >
            {v.initials}
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-700 text-[10px] font-bold text-white ring-2 ring-amber-50 dark:ring-amber-950">
            +{extra}
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
        {describeViewers(viewers)}
      </p>
    </div>
  );
}

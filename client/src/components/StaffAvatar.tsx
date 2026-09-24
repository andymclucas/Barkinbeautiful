import { useState } from "react";

/**
 * Small circular staff photo, falling back to the staff member's initials on
 * their own roster colour when there is no photo on file (or it fails to load).
 *
 * The fallback is deliberately colour-coded rather than a generic grey icon:
 * on the calendar and workflow board the roster colour is how staff are told
 * apart at a glance, so an avatar without a photo still carries that signal.
 */
export function StaffAvatar({
  photoUrl,
  name,
  colourHex,
  className = "h-6 w-6",
  ring = true,
}: {
  photoUrl?: string | null;
  name?: string | null;
  colourHex?: string | null;
  className?: string;
  ring?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const colour = colourHex ?? "#7c3aed";

  // "Ashleigh Knight" -> "AK"; single names -> first letter.
  const initials = (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const ringStyle = ring ? { boxShadow: `0 0 0 2px ${colour}33` } : undefined;

  if (!photoUrl || errored) {
    return (
      <div
        className={`${className} rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white select-none`}
        style={{ background: colour, ...ringStyle }}
        title={name ?? undefined}
        aria-label={name ?? "Staff member"}
      >
        {initials || "?"}
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={name ?? "Staff member"}
      title={name ?? undefined}
      loading="lazy"
      className={`${className} rounded-full object-cover shrink-0 bg-muted`}
      style={ringStyle}
      onError={() => setErrored(true)}
    />
  );
}

export default StaffAvatar;

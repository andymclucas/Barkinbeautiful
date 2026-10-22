import { Download } from "lucide-react";

/**
 * Marks a booking that came across from MoeGo.
 *
 * Andy, 22/10/2026: "Leave all ones that have been brought across from
 * MoeGo with the prices as is, but any new ones need to reflect pricing
 * on Groomigo." The badge exists so that rule can be followed by
 * looking, rather than by remembering.
 *
 * It matters most next to a price. 450 of 456 upcoming bookings were
 * imported, and 88% of those carry a figure the Groomigo catalogue does
 * not recognise — so "this price does not match the catalogue" is normal
 * on an imported row and a question on a Groomigo one. Without the
 * badge the two are indistinguishable, which is exactly how I came to
 * reprice sixteen imported bookings that were right all along.
 *
 * Slate, not a warning colour: nothing is wrong with an imported
 * booking. It is a fact about where the row came from.
 */
export function MoegoBadge({
  moegoAppointmentId,
  className = "",
}: {
  moegoAppointmentId?: string | null;
  className?: string;
}) {
  const id = String(moegoAppointmentId ?? "").trim();
  if (!id) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100 ${className}`}
      title={`Imported from MoeGo (booking ${id}). Its price is the original MoeGo figure and is left as it was — only bookings made in Groomigo use the Pricing & Services catalogue.`}
      data-testid="moego-badge"
    >
      <Download className="h-2.5 w-2.5" aria-hidden />
      MoeGo
    </span>
  );
}

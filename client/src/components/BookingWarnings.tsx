/**
 * The warnings a person must see before they press Book Appointment.
 *
 * It sits at the TOP of the dialog body, above the pet and service
 * pickers, because the thing that should stop a booking cannot be below
 * the fold of the thing that completes it. On 02/11/2026 a blacklisted
 * client's dog could be booked without a single flag being shown.
 *
 * Both staff booking surfaces render this same component off the same
 * shared rule, so the client page and the calendar cannot drift.
 */
import { AlertTriangle } from "lucide-react";
import {
  bookingWarnings,
  worstBookingWarningTone,
  type BookingWarningInput,
} from "@shared/bookingWarnings";

export function BookingWarnings(props: BookingWarningInput & { className?: string }) {
  const { className, ...input } = props;
  const warnings = bookingWarnings(input);
  const tone = worstBookingWarningTone(warnings);
  if (!tone) return null;

  const danger = tone === "danger";

  return (
    /*
     * role="alert" so it is announced when it appears — picking the dog is
     * what reveals this, and a sighted person sees a red panel arrive
     * while a screen reader user would otherwise get nothing at all.
     */
    <div
      role="alert"
      className={`rounded-xl border px-3.5 py-3 ${
        danger
          ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40"
          : "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40"
      } ${className ?? ""}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          aria-hidden
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            danger ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
          }`}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          {warnings.map((w, i) => (
            <p
              key={`${w.subject}-${i}`}
              className={`text-[13px] leading-snug ${
                w.tone === "danger"
                  ? "text-red-900 dark:text-red-200"
                  : "text-amber-900 dark:text-amber-200"
              }`}
            >
              {/* The label is carried by a word as well as by the colour,
                  so it survives being read aloud or printed in grey — and
                  it comes from `kind`, so "DO NOT BOOK" is reserved for the
                  blocked client and never put over a dog that just needs a
                  muzzle. */}
              <span className="font-semibold">
                {w.kind === "client-blocked"
                  ? "DO NOT BOOK"
                  : w.tone === "danger"
                    ? "Danger"
                    : "Caution"}{" "}
                — {w.subject}:
              </span>{" "}
              {w.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BookingWarnings;

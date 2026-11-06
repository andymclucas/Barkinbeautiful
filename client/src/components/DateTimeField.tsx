/**
 * A date-and-time field whose DATE half reads day-first on every machine.
 *
 * The companion to DateField, for the places that were
 * `<Input type="datetime-local">` — a booking's start and end, a rebook
 * slot. Same locale problem: the native control renders in the browser's
 * locale, so the salon's US-configured machine showed 11/03/2026 for the
 * 3rd of November.
 *
 * **The time half stays a native `<input type="time">`, deliberately.**
 * A native time input also follows the locale — 14:30 against 2:30 PM —
 * but unlike a date that is a difference in STYLE, not in meaning. Nobody
 * misreads 2:30 PM. The native picker is also better than anything worth
 * hand-rolling here, particularly on a phone. The rule is: control what
 * can be misread, leave what cannot.
 *
 * A drop-in for `<Input type="datetime-local">`: value and onChange both
 * speak the same `YYYY-MM-DDTHH:mm` string, so a call site converts in one
 * line and nothing downstream changes.
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateField";
import { cn } from "@/lib/utils";
import { joinLocalDateTime, splitLocalDateTime } from "@shared/bookingTimeSlots";

/**
 * Show the fallback day only while the date half is genuinely empty.
 *
 * Never overrides a date somebody typed, and never supplies a TIME —
 * a time is a duration, and guessing one would put a wrong end on a
 * groomer's afternoon.
 */
function withFallback(parts: { date: string; time: string }, fallbackDate?: string) {
  if (parts.date || !fallbackDate) return parts;
  return { date: fallbackDate, time: parts.time };
}

export function DateTimeField({
  value,
  onChange,
  className,
  wrapperClassName,
  id,
  min,
  max,
  disabled,
  fallbackDate,
  "aria-label": ariaLabel,
}: {
  /** "2026-11-03T09:00", or "" for empty. */
  value: string;
  onChange: (next: string) => void;
  /** Goes on both inputs, as it did on the one it replaces. */
  className?: string;
  wrapperClassName?: string;
  id?: string;
  /** ISO day keys, bounding the DATE half only. */
  min?: string;
  max?: string;
  disabled?: boolean;
  /**
   * The day to show in the DATE half while the field is still empty.
   *
   * A booking's "Ends" is the case this exists for. Five of the salon's
   * eight service types get no suggested duration — bath, deshed, nail
   * trim, daycare, other — which is 205 of 1,295 upcoming bookings, so
   * about one in six is booked with both halves blank. Staff then type a
   * full date AND a time, and the date picker opened on today rather
   * than on the booking, so a January appointment meant paging forward
   * three months. Lauren, 06/11/2026: "the ends date and time is
   * annoying".
   *
   * It is a DISPLAY default, not a value: joinLocalDateTime still
   * returns "" until a time is entered, so nothing is saved and no
   * duration is invented on the salon's behalf. All it removes is the
   * typing of a date that was never going to differ from the start.
   */
  fallbackDate?: string;
  "aria-label"?: string;
}) {
  /*
   * The two halves are held HERE, not derived from `value` on every render.
   *
   * `joinLocalDateTime` returns "" when either half is missing, which is
   * right for what gets saved - a date with no time is not a booking - but
   * it means a round trip through `value` loses the half that IS filled in.
   * Clearing the date would have wiped the time off the screen as well, and
   * the person would have had to retype something they never touched.
   */
  const [parts, setParts] = useState(() => withFallback(splitLocalDateTime(value), fallbackDate));

  // Follow the parent when it sets a value from elsewhere - "Next
  // available" fills these in - but not when the change is the one just
  // emitted from here, or a half-typed entry would be snapped back.
  useEffect(() => {
    if (joinLocalDateTime(parts.date, parts.time) === value) return;
    setParts(withFallback(splitLocalDateTime(value), fallbackDate));
    // Only on an external change; `parts` is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fallbackDate]);

  const { date, time } = parts;

  const emit = (nextDate: string, nextTime: string) => {
    setParts({ date: nextDate, time: nextTime });
    onChange(joinLocalDateTime(nextDate, nextTime));
  };

  return (
    /*
     * Wraps rather than squeezes.
     *
     * Several call sites put this in a half-width grid cell - the booking
     * dialog's "Ends" is 225px - and side by side that left the date 97px
     * against the ~145px it needs for DD/MM/YYYY plus the calendar button.
     * The placeholder rendered as "DD/MV". Each half declares the width it
     * actually needs and the row breaks when both will not fit, which is
     * two readable lines instead of one clipped one.
     */
    <div className={cn("flex flex-wrap gap-2", wrapperClassName)}>
      <DateField
        id={id}
        value={date}
        onChange={(next) => emit(next, time || "09:00")}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} date` : "Date"}
        wrapperClassName="min-w-[9rem] flex-1"
        className={className}
      />
      <Input
        type="time"
        value={time}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} time` : "Time"}
        className={cn("w-[7rem] shrink-0", className)}
        onChange={(e) => emit(date, e.target.value)}
      />
    </div>
  );
}

export default DateTimeField;

/**
 * A date field that reads day-first on every machine.
 *
 * Lauren, 03/11/2026: "What's with the American date?" — the board showed
 * 11/03/2026 for the 3rd of November.
 *
 * A native `<input type="date">` renders in the browser's locale, and no
 * HTML or CSS can change that. The salon's machine is set to US English, so
 * every date in the app reads back to front on it. See `shared/auDate.ts`
 * for why fixing that machine's settings is not the answer.
 *
 * **A drop-in for `<Input type="date">`**: same `value`/`onChange` contract,
 * both speaking the ISO `YYYY-MM-DD` key, so converting a call site is a
 * one-line change and nothing downstream has to know.
 *
 * Typing is kept, not replaced with a calendar-only button. Staff type
 * dates fast, and a date of birth is forty years of clicking backwards
 * otherwise. The calendar is there for picking a day near today, which is
 * the other half of how it gets used.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AU_DATE_HINT, formatAuDate, parseAuDate } from "@shared/auDate";
import { localCalendarDay, localCalendarDayKey } from "@shared/localDateTime";

export function DateField({
  value,
  onChange,
  className,
  wrapperClassName,
  id,
  min,
  max,
  disabled,
  "aria-label": ariaLabel,
  placeholder = AU_DATE_HINT,
}: {
  /** ISO day key, "2026-11-03", or "" for empty. */
  value: string;
  onChange: (next: string) => void;
  /**
   * Goes on the INPUT, exactly as it did on the `<Input type="date">` this
   * replaces — so swapping a call site is a one-line change and the
   * existing `h-8`, `w-36` and friends keep meaning what they meant. The
   * wrapper only exists to position the calendar button.
   */
  className?: string;
  /** For the wrapper, on the rare call site that was laying the field out. */
  wrapperClassName?: string;
  id?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  "aria-label"?: string;
  placeholder?: string;
}) {
  /*
   * The typed text is its own state, because it must be allowed to be
   * invalid while somebody is halfway through it. Committing only on a
   * parse means "3/1" does not briefly become the 1st of March before they
   * reach the "1" of "11".
   */
  const [text, setText] = useState(() => formatAuDate(value));
  const [open, setOpen] = useState(false);
  const editing = useRef(false);

  // Follow the value when the parent changes it — the board's ‹ › arrows do
  // exactly that — but never while the field is being typed into, or the
  // cursor jumps.
  useEffect(() => {
    if (!editing.current) setText(formatAuDate(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseAuDate(raw);
    if (parsed && !outOfRange(parsed, min, max)) {
      onChange(parsed);
      setText(formatAuDate(parsed));
      return;
    }
    if (raw.trim() === "") {
      onChange("");
      return;
    }
    // Unparseable, or outside the allowed range: put back the last good
    // value rather than leaving the field saying something that is not what
    // was saved.
    setText(formatAuDate(value));
  };

  const selected = value ? localCalendarDay(value) : undefined;

  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <Input
        id={id}
        value={text}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn("pr-9", className)}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => { editing.current = false; commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); editing.current = false; commit(text); }
          if (e.key === "Escape") { editing.current = false; setText(formatAuDate(value)); }
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Open the calendar"
            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={(day) => outOfRange(localCalendarDayKey(day), min, max)}
            onSelect={(day) => {
              if (!day) return;
              const key = localCalendarDayKey(day);
              onChange(key);
              setText(formatAuDate(key));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** ISO keys sort lexicographically, which is the whole reason they are the storage format. */
function outOfRange(key: string, min?: string, max?: string): boolean {
  if (min && key < min) return true;
  if (max && key > max) return true;
  return false;
}

export default DateField;

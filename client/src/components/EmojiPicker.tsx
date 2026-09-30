import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A small emoji picker for the SMS composer.
 *
 * Deliberately a short curated list rather than a full picker library: these
 * are messages to grooming clients, the set that actually gets used is small,
 * and a fixed grid stays fast and works the same on a phone as on the desk
 * machine. Targets are 40px so they are tappable.
 */
const GROUPS: { label: string; emoji: string[] }[] = [
  { label: "Dogs & pets", emoji: ["🐶", "🐕", "🐩", "🦮", "🐾", "🦴", "🛁", "✂️", "🧼", "💛", "🥰", "😍"] },
  { label: "Friendly", emoji: ["😊", "🙂", "😀", "😁", "😉", "😎", "🥳", "🤗", "👋", "🙌", "👍", "🙏"] },
  { label: "Practical", emoji: ["✅", "❌", "⏰", "📅", "📍", "📞", "💬", "💲", "⚠️", "❗", "❓", "✨"] },
  { label: "Weather & seasons", emoji: ["☀️", "🌧️", "❄️", "🎄", "🎉", "🎁", "🐰", "🎃", "💐", "🌸", "⭐", "❤️"] },
];

export function EmojiPicker({
  onSelect,
  disabled,
}: {
  /** Called with the chosen emoji; the caller decides where it lands. */
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label="Insert emoji"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        // Width is capped to the viewport so the grid never overflows on a phone.
        className="w-[min(20rem,calc(100vw-2rem))] max-h-[60vh] overflow-y-auto p-2"
      >
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-2 last:mb-0">
            <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
            <div className="grid grid-cols-6 gap-0.5">
              {group.emoji.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { onSelect(e); setOpen(false); }}
                  aria-label={`Insert ${e}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

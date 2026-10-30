import { useState, useId } from "react";
import { Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EMOJI_GROUPS, emojiAlreadyUsed, searchEmoji, insertAtCaret,
  type EmojiEntry,
} from "@shared/emojiPalette";

/**
 * An emoji button bound to a text field, opening INLINE.
 *
 * Andy, 30/10/2026: "Add in the emoji button so they can add them in
 * without a keyboard shortcut." Pet codes here already ARE emoji — 💊,
 * 💥, 📢, 🦻 and thirteen more are live in the catalogue — and the only
 * way to type one was Ctrl+Cmd+Space, a Mac shortcut that does not
 * exist on the iPad at the bench or on a Windows machine.
 *
 * **Why this is not `EmojiPicker`.** That one is the SMS composer's: a
 * popover, a friendly general vocabulary, one tap and it closes. Both
 * are right for their own job and the differences are not cosmetic:
 *
 * - It opens inline rather than in a popover, because this one lives
 *   inside a Dialog. A Radix popover portals to `body`, outside the
 *   dialog's focus trap, and taps inside it get swallowed.
 * - Its vocabulary is the salon's own — behaviour, health, handling,
 *   grooming, the diary — not ☀️ and 🥳. A code means something.
 * - It stays open after a tap, because "💥🚩" is a normal code.
 * - It searches, because sixty-odd entries is past scanning.
 *
 * What they DO share is `shared/emojiPalette.ts`: the insertion maths
 * is one tested function, used by the composer too.
 */
export function InlineEmojiPicker({
  value,
  onChange,
  inputRef,
  recentFrom = [],
  label = "Insert an emoji",
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The field to insert into. Its cursor decides where. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** This salon's existing text, to work out which emoji it already uses. */
  recentFrom?: readonly string[];
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useId();

  const alreadyUsed = emojiAlreadyUsed(recentFrom);
  const matches = searchEmoji(query);
  const searching = query.trim().length > 0;

  const insert = (emoji: string) => {
    const input = inputRef.current;
    const { value: next, caret } = insertAtCaret(
      value, emoji, input?.selectionStart ?? null, input?.selectionEnd ?? null,
    );
    onChange(next);
    /* Put the cursor back after the emoji so typing carries on where
       they were, rather than jumping to the end of the field. The input
       has not re-rendered with the new value yet, so this waits a frame. */
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(caret, caret); } catch { /* not every input allows it */ }
    });
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  const cell = (entry: EmojiEntry | string) => {
    const emoji = typeof entry === "string" ? entry : entry.emoji;
    const title = typeof entry === "string" ? emoji : `${emoji}  ${entry.label}`;
    return (
      <button
        key={emoji}
        type="button"
        title={title}
        aria-label={title}
        onClick={() => insert(emoji)}
        className="h-10 w-10 rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        {emoji}
      </button>
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        title={label}
        /* Deliberately does NOT focus the search box. On the iPad at the
           bench that pops the on-screen keyboard straight over the emoji
           grid — which is the one thing this button exists to avoid.
           Searching is for when sixty icons is too many to scan, and
           anyone who wants it can tap the box. */
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Smile className="h-4 w-4" />
      </Button>

      {open && (
        <div
          id={panelId}
          data-testid="emoji-panel"
          className="mt-2 w-full rounded-lg border bg-card p-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Close the panel, not the dialog around it.
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="flex items-center gap-2 pb-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — deaf, barker, shampoo…"
              className="h-8"
              aria-label="Search emoji"
            />
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              <X className="mr-1 h-3.5 w-3.5" />
              Done
            </Button>
          </div>

          <div className="max-h-56 overflow-y-auto pr-1">
            {searching ? (
              matches.length > 0 ? (
                <div className="flex flex-wrap gap-1">{matches.map(cell)}</div>
              ) : (
                <p className="px-1 py-3 text-sm text-muted-foreground">
                  Nothing matches “{query.trim()}”. You can still paste any emoji
                  straight into the box.
                </p>
              )
            ) : (
              <>
                {alreadyUsed.length > 0 && (
                  <section className="pb-2">
                    <h4 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                      Already used here
                    </h4>
                    <div className="flex flex-wrap gap-1">{alreadyUsed.map(cell)}</div>
                  </section>
                )}
                {EMOJI_GROUPS.map((group) => (
                  <section key={group.name} className="pb-2">
                    <h4 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                      {group.name}
                    </h4>
                    <div className="flex flex-wrap gap-1">{group.entries.map(cell)}</div>
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

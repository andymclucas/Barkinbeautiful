import { describe, it, expect } from "vitest";
import {
  EMOJI_GROUPS, emojiIn, emojiAlreadyUsed, searchEmoji, insertAtCaret,
} from "@shared/emojiPalette";

describe("the palette itself", () => {
  const all = EMOJI_GROUPS.flatMap((g) => g.entries);

  it("offers every emoji the salon already uses as a code", () => {
    // Read out of pet_codes on 30/10/2026. If one of these stops being
    // offered, somebody editing that code can no longer retype it.
    const inUse = ["💊", "💔", "🦿", "🐘", "👅", "💉", "💥", "💦", "💩", "📢", "🤯", "🦷", "🧴", "🚩", "🕶️", "🦻", "✂️"];
    const offered = new Set(all.map((e) => e.emoji));
    expect(inUse.filter((e) => !offered.has(e))).toEqual([]);
  });

  it("never offers the same emoji twice", () => {
    const seen = all.map((e) => e.emoji);
    expect(seen.length).toBe(new Set(seen).size);
  });

  it("gives every entry a label, so nothing is a bare character", () => {
    expect(all.filter((e) => !e.label.trim())).toEqual([]);
  });

  /**
   * A character added after Unicode 13 renders as an empty box on an
   * older phone, and a code nobody can read is worse than no code.
   * Checked by code point rather than by eye — 🪮 and 🩷 both look
   * perfectly ordinary in an editor on a current Mac.
   */
  it("holds nothing newer than Unicode 13", () => {
    const TOO_NEW = [
      [0x1fa7b, 0x1fa7f], [0x1fa83, 0x1fa8f], [0x1fab7, 0x1fabf],
      [0x1fac3, 0x1facf], [0x1fad7, 0x1fAFF], [0x1fa75, 0x1fa77],
    ];
    const offenders = all.filter((entry) =>
      [...entry.emoji].some((ch) => {
        const cp = ch.codePointAt(0) ?? 0;
        return TOO_NEW.some(([lo, hi]) => cp >= lo && cp <= hi);
      }));
    expect(offenders.map((o) => `${o.emoji} ${o.label}`)).toEqual([]);
  });
});

describe("emojiIn", () => {
  it("finds the emoji in a code that mixes it with text", () => {
    expect(emojiIn("✂️5f")).toEqual(["✂️"]);
    expect(emojiIn("💊")).toEqual(["💊"]);
  });

  it("keeps a variation selector attached", () => {
    // Stripping it offers "✂", which renders as black-and-white text
    // on some platforms and is a different character to what was saved.
    expect(emojiIn("✂️5f")[0]).toBe("✂️");
  });

  it("keeps a ZWJ sequence in one piece", () => {
    expect(emojiIn("😮‍💨 settles")).toEqual(["😮‍💨"]);
  });

  it("finds nothing in plain text", () => {
    expect(emojiIn("DOG AGGRESSIVE")).toEqual([]);
    expect(emojiIn("#7f")).toEqual([]);
  });

  it("does not count a copyright symbol as an emoji", () => {
    expect(emojiIn("© 2026")).toEqual([]);
  });

  it("finds several", () => {
    expect(emojiIn("💥🚩 danger")).toEqual(["💥", "🚩"]);
  });
});

describe("emojiAlreadyUsed", () => {
  it("puts the most-used first", () => {
    expect(emojiAlreadyUsed(["✂️5f", "✂️4f", "💊", "✂️3", "💊"]))
      .toEqual(["✂️", "💊"]);
  });

  it("is empty for a salon whose codes are all words", () => {
    expect(emojiAlreadyUsed(["SENSITIVE", "DOG AGGRESSIVE", "#7f"])).toEqual([]);
  });

  it("caps the row rather than filling the dialog", () => {
    const many = Array.from({ length: 40 }, (_, i) => String.fromCodePoint(0x1f600 + i));
    expect(emojiAlreadyUsed(many).length).toBe(16);
    expect(emojiAlreadyUsed(many, 4).length).toBe(4);
  });

  it("is stable when two are used equally often", () => {
    const once = emojiAlreadyUsed(["💥", "🚩"]);
    expect(emojiAlreadyUsed(["🚩", "💥"])).toEqual(once);
  });
});

describe("searchEmoji", () => {
  it("finds by the salon's own meaning", () => {
    expect(searchEmoji("deaf").map((e) => e.emoji)).toContain("🦻");
    expect(searchEmoji("barker").map((e) => e.emoji)).toContain("📢");
  });

  it("finds by a word that is not the label", () => {
    expect(searchEmoji("scissors").map((e) => e.emoji)).toContain("✂️");
    expect(searchEmoji("hips").map((e) => e.emoji)).toContain("🦿");
  });

  it("ignores case and surrounding space", () => {
    expect(searchEmoji("  MEDICATION ").map((e) => e.emoji)).toEqual(["💊"]);
  });

  it("finds a whole group by its name", () => {
    expect(searchEmoji("grooming").length).toBe(
      EMOJI_GROUPS.find((g) => g.name === "Grooming")!.entries.length);
  });

  it("finds the emoji itself, pasted in", () => {
    expect(searchEmoji("💩").map((e) => e.emoji)).toEqual(["💩"]);
  });

  it("returns nothing for an empty query, so the caller shows the groups", () => {
    expect(searchEmoji("")).toEqual([]);
    expect(searchEmoji("   ")).toEqual([]);
  });

  it("returns nothing rather than everything for a word that is not there", () => {
    expect(searchEmoji("quantum")).toEqual([]);
  });
});

describe("insertAtCaret", () => {
  it("inserts where the cursor is", () => {
    expect(insertAtCaret("5f", "✂️", 0)).toEqual({ value: "✂️5f", caret: 2 });
  });

  it("appends when the cursor is at the end", () => {
    expect(insertAtCaret("5f", "✂️", 2)).toEqual({ value: "5f✂️", caret: 4 });
  });

  /** An input reports a null caret until it has been focused. */
  it("appends when there is no cursor yet", () => {
    expect(insertAtCaret("5f", "✂️", null)).toEqual({ value: "5f✂️", caret: 4 });
  });

  it("replaces a selection", () => {
    expect(insertAtCaret("OLD CODE", "💊", 0, 3)).toEqual({ value: "💊 CODE", caret: 2 });
  });

  it("inserts into an empty field", () => {
    expect(insertAtCaret("", "💥", 0)).toEqual({ value: "💥", caret: 2 });
  });

  it("clamps a cursor past the end rather than leaving a gap", () => {
    expect(insertAtCaret("ab", "💊", 99)).toEqual({ value: "ab💊", caret: 4 });
  });

  /**
   * An input always reports selectionStart <= selectionEnd, so this is
   * nonsense input rather than a real case. It inserts and deletes
   * NOTHING, which is the safe reading: guessing that the pair was
   * meant the other way round would silently eat two characters
   * somebody typed.
   */
  it("deletes nothing when handed a backwards selection", () => {
    expect(insertAtCaret("abcd", "X", 3, 1).value).toBe("abcXd");
  });

  /**
   * The caret is a UTF-16 offset, which is what an input's
   * selectionStart and setSelectionRange both speak. An emoji is two
   * code units, so a caret counted in characters would land inside it
   * and the next keystroke would split it.
   */
  it("returns a caret the input can actually use", () => {
    const { value, caret } = insertAtCaret("5f", "💊", 0);
    expect(value.slice(0, caret)).toBe("💊");
  });
});

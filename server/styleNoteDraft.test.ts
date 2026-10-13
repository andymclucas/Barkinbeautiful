import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EMPTY_STYLE_NOTE_DRAFT,
  activeStylePetId,
  isStyleDraftEmpty,
  styleDraftFromNote,
  type StyleNoteDraft,
} from "@shared/styleNoteDraft";

const TEDDY_STYLE: StyleNoteDraft = {
  ...EMPTY_STYLE_NOTE_DRAFT,
  serviceType: "Summer Groom",
  bladeSize: "#3",
  bodyLength: "#3",
  photoUrl: "https://example.test/teddy.jpg",
};

describe("activeStylePetId", () => {
  it("follows the dog selected inside the dialog", () => {
    // A multi-dog family is switched between without reopening, so the
    // selected dog wins over the one the appointment was opened on.
    expect(activeStylePetId({ selectedStylePetId: 200, appointmentPetId: 100 })).toBe(200);
  });

  it("falls back to the appointment's own dog", () => {
    expect(activeStylePetId({ selectedStylePetId: null, appointmentPetId: 100 })).toBe(100);
  });

  it("is null when the dialog is closed", () => {
    // This is what makes the reset fire: closing clears both, so the id
    // changes, so the draft is dropped before the next dog is opened.
    expect(activeStylePetId({ selectedStylePetId: null, appointmentPetId: null })).toBeNull();
    expect(activeStylePetId({})).toBeNull();
  });

  it("changes when the dog changes, which is what the draft keys on", () => {
    // Lauren's bug: Teddy -> Maisie produced no reset because nothing was
    // watching this value.
    const teddy = activeStylePetId({ appointmentPetId: 100 });
    const maisie = activeStylePetId({ appointmentPetId: 200 });
    expect(teddy).not.toBe(maisie);
  });

  it("does not treat pet 0 as absent", () => {
    // ?? not ||: a falsy-but-real id must not fall through to the other pet.
    expect(activeStylePetId({ selectedStylePetId: 0, appointmentPetId: 100 })).toBe(0);
  });
});

describe("styleDraftFromNote", () => {
  it("loads a saved style", () => {
    const draft = styleDraftFromNote({
      serviceType: "Summer Groom", bladeSize: "#7", headStyle: "Long top knot",
    });
    expect(draft.serviceType).toBe("Summer Groom");
    expect(draft.bladeSize).toBe("#7");
    expect(draft.headStyle).toBe("Long top knot");
  });

  it("turns missing fields into empty strings, never undefined", () => {
    // These feed controlled inputs; undefined would flip them to uncontrolled
    // and React would warn and lose the value.
    const draft = styleDraftFromNote({ bladeSize: null });
    for (const value of Object.values(draft)) expect(value).toBe("");
  });

  it("never carries the photo key across", () => {
    // The key is the S3 object the ORIGINAL note owns. A new note showing the
    // same picture must not claim it, or deleting the new one takes the old
    // one's photo with it. The URL alone is enough to display it.
    const draft = styleDraftFromNote({
      photoUrl: "https://example.test/teddy.jpg",
      photoKey: "pets/100/teddy.jpg",
    });
    expect(draft.photoUrl).toBe("https://example.test/teddy.jpg");
    expect(draft.photoKey).toBe("");
  });

  it("gives an empty draft for a dog with no previous style", () => {
    expect(styleDraftFromNote(null)).toEqual(EMPTY_STYLE_NOTE_DRAFT);
    expect(styleDraftFromNote(undefined)).toEqual(EMPTY_STYLE_NOTE_DRAFT);
  });

  it("does not hand back the shared empty object", () => {
    // Editing a field on the returned draft must not poison the constant for
    // every later dog.
    const draft = styleDraftFromNote(null);
    draft.bladeSize = "#3";
    expect(EMPTY_STYLE_NOTE_DRAFT.bladeSize).toBe("");
  });
});

describe("isStyleDraftEmpty", () => {
  it("knows an untouched form from one holding another dog's work", () => {
    expect(isStyleDraftEmpty(EMPTY_STYLE_NOTE_DRAFT)).toBe(true);
    expect(isStyleDraftEmpty(TEDDY_STYLE)).toBe(false);
  });

  it("counts a photo on its own as entered", () => {
    // "there is Teddy and her pic" — the photo alone is enough to be wrong.
    expect(isStyleDraftEmpty({ ...EMPTY_STYLE_NOTE_DRAFT, photoUrl: "x" })).toBe(false);
  });
});

describe("the draft always belongs to one dog", () => {
  it("is dropped when the dog changes", () => {
    // The whole fix in one assertion: a draft is only reusable while the pet
    // it was started for is still the active one.
    const started = activeStylePetId({ appointmentPetId: 100 });
    let draft = TEDDY_STYLE;

    const nowShowing = activeStylePetId({ appointmentPetId: 200 });
    if (nowShowing !== started) draft = { ...EMPTY_STYLE_NOTE_DRAFT };

    expect(isStyleDraftEmpty(draft)).toBe(true);
    expect(draft.photoUrl).toBe("");
  });

  it("survives while the same dog is open", () => {
    const started = activeStylePetId({ appointmentPetId: 100 });
    let draft = TEDDY_STYLE;

    const nowShowing = activeStylePetId({ selectedStylePetId: 100, appointmentPetId: 100 });
    if (nowShowing !== started) draft = { ...EMPTY_STYLE_NOTE_DRAFT };

    expect(draft.bladeSize).toBe("#3");
  });
});

/**
 * Delegation check, in the sense CLAUDE.md §7 allows: it counts call sites
 * rather than asserting behaviour from source text.
 *
 * `selectedStylePetId ?? editAppt.petId` was written inline at five places in
 * Calendar.tsx. Nothing watched it, so nothing noticed when the dog changed
 * and the draft stayed put. If a sixth copy is added instead of calling
 * activeStylePetId, that copy is outside the reset and the bug comes back.
 */
describe("Calendar delegates to the shared draft rules", () => {
  const source = readFileSync(
    new URL("../client/src/pages/Calendar.tsx", import.meta.url),
    "utf8",
  );

  it("has no inline copies of the active-pet expression left", () => {
    const inline = source.match(/selectedStylePetId\s*\?\?\s*editAppt/g) ?? [];
    expect(inline).toHaveLength(0);
  });

  it("resets the draft on a dog change rather than only on save", () => {
    // Before the fix the only reset was createStyleNote.onSuccess, which is
    // why an unsaved draft outlived the dog it was for.
    const resets = source.match(/EMPTY_STYLE_NOTE_DRAFT/g) ?? [];
    expect(resets.length).toBeGreaterThanOrEqual(3);
  });
});

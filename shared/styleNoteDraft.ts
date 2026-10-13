/**
 * The style-note draft in the appointment dialog.
 *
 * A draft belongs to exactly ONE pet, and that is the whole point of this
 * file. On 13/10/2026 Lauren entered a style for Teddy, opened Maisie's box
 * and found Teddy's blade sizes and Teddy's photo sitting in the form under
 * Maisie's name.
 *
 * The dialog clears the draft only after a successful save. Closing the
 * dialog did not clear it, and nor did switching dogs inside it, so whatever
 * was typed for one dog survived into the next one's form. Pressing Save
 * there writes the stale fields against the NEW pet's id — a dog gets another
 * dog's grooming instructions and another dog's photo, permanently. A wrong
 * blade length is a welfare problem, not a cosmetic one.
 *
 * `activeStylePetId` is the identity the draft is tied to. It was written
 * inline as `selectedStylePetId ?? editAppt.petId` at five separate call
 * sites, which is exactly the duplication that drifts.
 */

export type StyleNoteDraft = {
  note: string;
  serviceType: string;
  bladeSize: string;
  combSize: string;
  bodyLength: string;
  headStyle: string;
  faceStyle: string;
  earStyle: string;
  legStyle: string;
  tailStyle: string;
  warnings: string;
  alertLevel: string;
  photoUrl: string;
  photoKey: string;
};

export const EMPTY_STYLE_NOTE_DRAFT: StyleNoteDraft = {
  note: "", serviceType: "", bladeSize: "", combSize: "", bodyLength: "",
  headStyle: "", faceStyle: "", earStyle: "", legStyle: "", tailStyle: "",
  warnings: "", alertLevel: "", photoUrl: "", photoKey: "",
};

/** Every field a saved note can carry into a draft. */
export type StyleNoteSource = Partial<Record<keyof StyleNoteDraft, string | null>>;

/**
 * Which pet a style draft is for.
 *
 * The dialog opens on one appointment but a multi-dog family can be switched
 * between inside it, so the selected dog wins when there is one.
 */
export function activeStylePetId(input: {
  selectedStylePetId?: number | null;
  appointmentPetId?: number | null;
}): number | null {
  return input.selectedStylePetId ?? input.appointmentPetId ?? null;
}

/**
 * Load a saved note into a fresh draft — "Use last style" and the "↩ Use"
 * button on a past note.
 *
 * `photoKey` is deliberately NOT carried over. The key is the S3 object this
 * note owns; a new note that merely shows the same picture must not claim it,
 * or deleting the new note would take the original note's photo with it. The
 * URL is enough to display it.
 */
export function styleDraftFromNote(note: StyleNoteSource | null | undefined): StyleNoteDraft {
  if (!note) return { ...EMPTY_STYLE_NOTE_DRAFT };
  const draft = { ...EMPTY_STYLE_NOTE_DRAFT };
  for (const key of Object.keys(EMPTY_STYLE_NOTE_DRAFT) as Array<keyof StyleNoteDraft>) {
    draft[key] = note[key] ?? "";
  }
  draft.photoKey = "";
  return draft;
}

/**
 * Has anything been entered? Used to tell a draft that is merely untouched
 * from one carrying another dog's work.
 */
export function isStyleDraftEmpty(draft: StyleNoteDraft): boolean {
  return (Object.keys(EMPTY_STYLE_NOTE_DRAFT) as Array<keyof StyleNoteDraft>)
    .every((key) => (draft[key] ?? "") === "");
}

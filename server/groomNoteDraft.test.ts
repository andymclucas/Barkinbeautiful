import { describe, expect, it } from "vitest";
import { groomNoteSaveable } from "../shared/groomNoteDraft";

describe("groomNoteSaveable", () => {
  it("saves a new note", () => {
    expect(groomNoteSaveable({ draft: "#7 body, 13mm head", existing: null })).toBe(true);
  });

  it("saves an edit to the note already on the booking", () => {
    expect(groomNoteSaveable({ draft: "#7 body, 13mm head", existing: "#5 body" })).toBe(true);
  });

  it("has nothing to save when the box is empty", () => {
    for (const draft of ["", "   ", "\n", null, undefined]) {
      expect(groomNoteSaveable({ draft, existing: "#5 body" }), JSON.stringify(draft)).toBe(false);
    }
  });

  /*
   * The one that matters. `groomNotes.create` inserts, so a Save that
   * should be a no-op is not harmless — it puts a second identical row
   * into the dog's permanent styling history.
   */
  it("has nothing to save when the note is unchanged", () => {
    expect(groomNoteSaveable({ draft: "#5 body", existing: "#5 body" })).toBe(false);
  });

  it("does not count trailing whitespace as an edit", () => {
    expect(groomNoteSaveable({ draft: "  #5 body \n", existing: "#5 body" })).toBe(false);
  });

  /* A dog with no note yet, and a groomer who typed only spaces. */
  it("copes with both sides missing", () => {
    expect(groomNoteSaveable({ draft: "  ", existing: null })).toBe(false);
    expect(groomNoteSaveable({ draft: null, existing: undefined })).toBe(false);
  });

  /* Case is content on a grooming note: "#7F" and "#7f" are a real edit
     to make, even though neither reads differently out loud. */
  it("treats a case change as an edit", () => {
    expect(groomNoteSaveable({ draft: "#7F body", existing: "#7f body" })).toBe(true);
  });
});

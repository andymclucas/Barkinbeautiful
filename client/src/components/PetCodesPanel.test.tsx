import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RESTING_CODE_LIMIT } from "@shared/petCodeSearch";

/** Synchronous keystrokes — see the note in NewClientQuickAdd.test.tsx. */
const setupUser = () => userEvent.setup({ delay: null });

const updateCodes = vi.fn();
const invalidate = vi.fn();

/**
 * `pets.updateCodes` returns exactly what it stored, and the panel adopts
 * that as the truth from the first save onwards. The stub does the same, so
 * a second interaction in one test sees the result of the first.
 */
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      calendar: { invalidate },
      pets: { invalidate },
      petCodes: { invalidate },
    }),
    petCodes: { list: { useQuery: () => ({ data: (globalThis as any).__catalogue }) } },
    pets: {
      updateCodes: {
        useMutation: ({ onSuccess }: { onSuccess?: (r: { codes: string[] }) => void }) => ({
          isPending: false,
          mutate: (input: { petId: number; codes: string[] }) => {
            updateCodes(input);
            onSuccess?.({ codes: input.codes });
          },
        }),
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { PetCodesPanel } from "./PetCodesPanel";

/**
 * Fourteen codes, so the resting cap of twelve has something to hide. Shapes
 * and usage counts follow the real vocabulary: blade numbers are common,
 * safety flags are not, and `Ner` is only findable by its description.
 */
const CATALOGUE = [
  { id: 1, code: "#5f", description: "Blade 5 finish", colourHex: null, dogsUsing: 58 },
  { id: 2, code: "No cologne", description: "Owner asks for no cologne", colourHex: null, dogsUsing: 40 },
  { id: 3, code: "#3", description: "Blade 3 body", colourHex: null, dogsUsing: 31 },
  { id: 4, code: "Ner", description: "Nervous dog, go slowly", colourHex: null, dogsUsing: 23 },
  { id: 5, code: "PLUCK EARS", description: "Pluck the ears every visit", colourHex: null, dogsUsing: 17 },
  { id: 6, code: "DOG AGGRESSIVE", description: "Cannot be near other dogs", colourHex: "#dc2626", dogsUsing: 12 },
  { id: 7, code: "Char Do", description: "Charlotte's usual style", colourHex: null, dogsUsing: 9 },
  { id: 8, code: "muzzle", description: "Needs a muzzle", colourHex: null, dogsUsing: 8 },
  { id: 9, code: "Bites", description: "Has bitten a groomer", colourHex: null, dogsUsing: 6 },
  { id: 10, code: "#16mm", description: "16mm all over", colourHex: null, dogsUsing: 4 },
  { id: 11, code: "SEDATED", description: "Owner sedates before the visit", colourHex: null, dogsUsing: 3 },
  { id: 12, code: "#3 PFFT", description: "Blade 3, blow out the coat", colourHex: null, dogsUsing: 2 },
  { id: 13, code: "Megs do", description: "Megan's usual style", colourHex: null, dogsUsing: 1 },
  { id: 14, code: "Retired", description: "Nobody carries this", colourHex: null, dogsUsing: 0 },
];

const show = (codes: string | null = null) =>
  render(<PetCodesPanel petId={1574} petName="Link" codes={codes} />);

/** The dashed "+ code" shortcuts, as opposed to the chips already on the dog. */
const suggestions = () =>
  screen.getAllByRole("button", { name: /^\+ / }).map((b) => b.textContent ?? "");

const searchBox = () => screen.getByLabelText("Search or add a code");

beforeEach(() => {
  updateCodes.mockReset();
  invalidate.mockReset();
  (globalThis as any).__catalogue = CATALOGUE;
});

describe("PetCodesPanel — the resting list", () => {
  it("opens on the most-used codes, not the whole vocabulary", () => {
    show();
    expect(suggestions()).toHaveLength(RESTING_CODE_LIMIT);
    // Most-carried first, so a groomer's commonest pick is the first chip.
    expect(suggestions()[0]).toContain("#5f");
  });

  it("says how much it is holding back, and offers the rest", () => {
    show();
    expect(screen.getByText(`Most used (${RESTING_CODE_LIMIT} of ${CATALOGUE.length})`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Show all ${CATALOGUE.length} codes` })).toBeInTheDocument();
  });

  it("shows everything once asked, and offers the way back", async () => {
    const user = setupUser();
    show();
    await user.click(screen.getByRole("button", { name: `Show all ${CATALOGUE.length} codes` }));
    expect(suggestions()).toHaveLength(CATALOGUE.length);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("does not offer a code the dog already carries", () => {
    show("#5f, Ner");
    expect(suggestions().some((t) => t.includes("#5f"))).toBe(false);
    expect(suggestions().some((t) => t.startsWith("+ Ner"))).toBe(false);
  });

  it("offers no shortcut at all when nothing is left to add", () => {
    (globalThis as any).__catalogue = [CATALOGUE[0]];
    show("#5f");
    expect(screen.queryByRole("button", { name: /^\+ / })).not.toBeInTheDocument();
  });
});

describe("PetCodesPanel — searching", () => {
  it("narrows to what was typed and drops the cap", async () => {
    const user = setupUser();
    show();
    await user.type(searchBox(), "#3");
    expect(suggestions()).toEqual(["+ #3", "+ #3 PFFT"]);
    expect(screen.getByText("Matching codes (2)")).toBeInTheDocument();
  });

  it("finds a code by what it means, and says why it is there", async () => {
    const user = setupUser();
    show();
    await user.type(searchBox(), "nervous");
    // The whole point: nobody guesses the nervous-dog code is spelled "Ner",
    // and a bare "+ Ner" chip would look like a bug.
    expect(suggestions()).toEqual(["+ Ner· Nervous dog, go slowly"]);
  });

  it("says plainly when the salon has no such code", async () => {
    const user = setupUser();
    show();
    await user.type(searchBox(), "zzzz");
    expect(screen.getByText(/No code in the salon.s list matches/)).toBeInTheDocument();
    expect(screen.getByText(/Add saves it to this dog as a new one/)).toBeInTheDocument();
  });

  it("says the opposite when the code does exist", async () => {
    const user = setupUser();
    show();
    await user.type(searchBox(), "muzzle");
    expect(screen.getByText(/which the salon already uses/)).toBeInTheDocument();
  });

  it("clears back to the resting list", async () => {
    const user = setupUser();
    show();
    await user.type(searchBox(), "#3");
    await user.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(suggestions()).toHaveLength(RESTING_CODE_LIMIT);
  });
});

describe("PetCodesPanel — add, remove, edit", () => {
  it("attaches a code when its shortcut is pressed", async () => {
    const user = setupUser();
    show("#5f");
    await user.click(screen.getByRole("button", { name: "+ muzzle" }));
    expect(updateCodes).toHaveBeenCalledWith({ petId: 1574, codes: ["#5f", "muzzle"] });
  });

  it("saves free text the salon has never used", async () => {
    const user = setupUser();
    show("#5f");
    await user.type(searchBox(), "No nails");
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(updateCodes).toHaveBeenCalledWith({ petId: 1574, codes: ["#5f", "No nails"] });
  });

  it("removes a code without disturbing the others", async () => {
    const user = setupUser();
    show("#5f, Ner, muzzle");
    await user.click(screen.getByRole("button", { name: "Remove Ner" }));
    expect(updateCodes).toHaveBeenCalledWith({ petId: 1574, codes: ["#5f", "muzzle"] });
  });

  it("renames in place rather than moving the code to the end", async () => {
    const user = setupUser();
    show("#5f, Ner, muzzle");
    await user.click(screen.getByRole("button", { name: "Edit Ner" }));
    const box = screen.getByDisplayValue("Ner");
    await user.clear(box);
    await user.type(box, "Nervous");
    await user.click(screen.getByRole("button", { name: "Save Ner" }));
    // Staff read these in the order they were put on, so the renamed code
    // stays in the middle.
    expect(updateCodes).toHaveBeenCalledWith({ petId: 1574, codes: ["#5f", "Nervous", "muzzle"] });
  });

  it("writes nothing when an edit is abandoned", async () => {
    const user = setupUser();
    show("#5f, Ner");
    await user.click(screen.getByRole("button", { name: "Edit Ner" }));
    await user.type(screen.getByDisplayValue("Ner"), "{Escape}");
    expect(updateCodes).not.toHaveBeenCalled();
    expect(screen.getByText("Ner")).toBeInTheDocument();
  });

  it("writes nothing when an edit changes nothing", async () => {
    const user = setupUser();
    show("#5f, Ner");
    await user.click(screen.getByRole("button", { name: "Edit Ner" }));
    await user.click(screen.getByRole("button", { name: "Save Ner" }));
    expect(updateCodes).not.toHaveBeenCalled();
  });

  it("refreshes the board and the client record, not just this dialog", async () => {
    const user = setupUser();
    show("#5f");
    await user.click(screen.getByRole("button", { name: "+ muzzle" }));
    // The dog's codes show in three places; a save that only refreshed the
    // dialog would leave the other two stale.
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it("stops offering a code once it has been added", async () => {
    const user = setupUser();
    show("#5f");
    await user.click(screen.getByRole("button", { name: "+ muzzle" }));
    expect(screen.queryByRole("button", { name: "+ muzzle" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove muzzle" })).toBeInTheDocument();
  });
});

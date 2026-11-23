import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateDetails = vi.fn();
const create = vi.fn();

vi.mock("@/lib/trpc", () => {
  const mutation = (spy: (input: unknown) => void) => () => ({
    isPending: false,
    mutate: (input: unknown) => spy(input),
    mutateAsync: async (input: unknown) => spy(input),
  });
  return {
    trpc: {
      pets: {
        create: { useMutation: mutation((i) => create(i)) },
        updateDetails: { useMutation: mutation((i) => updateDetails(i)) },
        updateSizeBand: { useMutation: mutation(() => {}) },
        remove: { useMutation: mutation(() => {}) },
      },
    },
  };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/BreedInput", () => ({
  BreedInput: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { PetEditorDialog } from "./PetEditorDialog";

/** Lauren, 24/11/2026: "it wont let me edit the dogs Gender". */
describe("PetEditorDialog gender", () => {
  beforeEach(() => { updateDetails.mockClear(); create.mockClear(); });

  it("shows the dog's gender and sends it, with desexed, when saved", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <PetEditorDialog
        open
        clientId={1}
        pet={{ id: 7, name: "Penny", breed: "Shoodle", sizeBand: null, gender: "female", desexed: false }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Gender" })).toHaveTextContent("Female");
    await user.click(screen.getByRole("checkbox", { name: "Desexed" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateDetails).toHaveBeenCalledWith(expect.objectContaining({ petId: 7, gender: "female", desexed: true }));
  });

  it("treats a dog with no gender on file as not known", () => {
    render(
      <PetEditorDialog
        open
        clientId={1}
        pet={{ id: 8, name: "Louie", breed: null, sizeBand: null }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Gender" })).toHaveTextContent("Not known");
  });

  it("sends the gender for a new dog too", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PetEditorDialog open clientId={3} pet={null} onClose={() => {}} onSaved={() => {}} />);
    await user.type(screen.getByLabelText("Name *"), "Rex");
    await user.click(screen.getByRole("button", { name: "Add dog" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 3, name: "Rex", gender: "unknown", desexed: false }));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PetCodeCatalogue } from "./PetCodeCatalogue";

/**
 * Andy, 10/11/2026: "Perhaps they can be sorted under the pet codes to
 * 'Codes' and 'Warnings' and these behave differently."
 */
const rows = [
  { id: 1, code: "SENSITIVE", description: "SENSITIVE", colourHex: null, sortOrder: 1, isActive: true, isWarning: true, dogsUsing: 89 },
  { id: 2, code: "✂5f", description: "5F blade", colourHex: "#3b82f6", sortOrder: 2, isActive: true, isWarning: false, dogsUsing: 40 },
  // Not flagged on its row, and a warning anyway.
  { id: 3, code: "DOG AGGRESSIVE", description: null, colourHex: null, sortOrder: 3, isActive: true, isWarning: false, dogsUsing: 6 },
];
const update = vi.fn();
const create = vi.fn();

vi.mock("@/lib/trpc", () => {
  const mutation = (fn: (input: unknown) => void) => () => ({ isPending: false, mutate: fn });
  return {
    trpc: {
      useUtils: () => ({ petCodes: { list: { invalidate: vi.fn() } } }),
      petCodes: {
        list: { useQuery: () => ({ data: rows, isLoading: false }) },
        create: { useMutation: mutation((i) => create(i)) },
        update: { useMutation: mutation((i) => update(i)) },
        delete: { useMutation: mutation(() => undefined) },
      },
    },
  };
});
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const codesIn = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByTestId("pet-code-row")
    .map((row) => row.querySelector("td span")?.textContent);

describe("PetCodeCatalogue", () => {
  beforeEach(() => {
    update.mockClear();
    create.mockClear();
  });

  it("sorts the catalogue into Warnings and Codes", () => {
    render(<PetCodeCatalogue />);
    expect(codesIn("pet-code-section-warnings")).toEqual(["SENSITIVE", "DOG AGGRESSIVE"]);
    expect(codesIn("pet-code-section-codes")).toEqual(["✂5f"]);
  });

  it("draws every warning row's badge red", () => {
    render(<PetCodeCatalogue />);
    const badges = within(screen.getByTestId("pet-code-section-warnings"))
      .getAllByTestId("pet-code-row")
      .map((row) => row.querySelector("td span") as HTMLElement);
    for (const badge of badges) expect(badge.className).toContain("bg-red-600");
  });

  it("moves a code to Warnings when the switch is turned on and saved", () => {
    render(<PetCodeCatalogue />);
    fireEvent.click(screen.getByRole("button", { name: "Edit ✂5f" }));
    const toggle = screen.getByRole("switch", { name: "Warning" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ id: 2, code: "✂5f", isWarning: true });
  });

  it("will not let an aggression code be switched off", () => {
    render(<PetCodeCatalogue />);
    fireEvent.click(screen.getByRole("button", { name: "Edit DOG AGGRESSIVE" }));
    const toggle = screen.getByRole("switch", { name: "Warning" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update.mock.calls[0][0]).toMatchObject({ id: 3, isWarning: true });
  });
});

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

const showWarnings = () => fireEvent.click(screen.getByRole("tab", { name: /Warnings/ }));
const typeSelect = () => screen.getByLabelText("Type") as HTMLSelectElement;

describe("PetCodeCatalogue", () => {
  beforeEach(() => {
    update.mockClear();
    create.mockClear();
  });

  /* Andy, 10/11/2026: "Split them into headers at the top under the Add
     Code button that are the two categories." */
  it("opens on Pet Codes, with a header for each category and its count", () => {
    render(<PetCodeCatalogue />);
    expect(screen.getByRole("tab", { name: /Pet Codes\s*1/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Warnings\s*2/ })).toHaveAttribute("aria-selected", "false");
    // The red header is a stylesheet rule keyed on this attribute.
    expect(screen.getByRole("tab", { name: /Warnings/ })).toHaveAttribute("data-tone", "warning");
    expect(codesIn("pet-code-section-codes")).toEqual(["✂5f"]);
    expect(screen.queryByTestId("pet-code-section-warnings")).toBeNull();
  });

  it("shows only the warnings when the Warnings header is chosen", () => {
    render(<PetCodeCatalogue />);
    showWarnings();
    expect(codesIn("pet-code-section-warnings")).toEqual(["SENSITIVE", "DOG AGGRESSIVE"]);
    expect(screen.queryByTestId("pet-code-section-codes")).toBeNull();
  });

  it("draws every warning row's badge red", () => {
    render(<PetCodeCatalogue />);
    showWarnings();
    const badges = within(screen.getByTestId("pet-code-section-warnings"))
      .getAllByTestId("pet-code-row")
      .map((row) => row.querySelector("td span") as HTMLElement);
    for (const badge of badges) expect(badge.className).toContain("bg-red-600");
  });

  /* "When adding, give a dropdown option for either Pet Code or Warning." */
  it("offers Pet Code or Warning when adding, and saves the one chosen", () => {
    render(<PetCodeCatalogue />);
    fireEvent.click(screen.getByRole("button", { name: "Add code" }));
    expect(Array.from(typeSelect().options).map((o) => o.textContent)).toEqual(["Pet Code", "Warning"]);
    expect(typeSelect().value).toBe("code");
    fireEvent.change(screen.getByPlaceholderText("SENSITIVE"), { target: { value: "WARTS" } });
    fireEvent.change(typeSelect(), { target: { value: "warning" } });
    fireEvent.click(screen.getByRole("button", { name: "Add warning" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ code: "WARTS", isWarning: true });
  });

  it("starts a new entry as a Warning when added from the Warnings list", () => {
    render(<PetCodeCatalogue />);
    showWarnings();
    fireEvent.click(screen.getByRole("button", { name: "Add code" }));
    expect(typeSelect().value).toBe("warning");
  });

  it("adds a plain code as not a warning", () => {
    render(<PetCodeCatalogue />);
    fireEvent.click(screen.getByRole("button", { name: "Add code" }));
    fireEvent.change(screen.getByPlaceholderText("SENSITIVE"), { target: { value: "✂7f" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add code" }));
    expect(create.mock.calls[0][0]).toMatchObject({ code: "✂7f", isWarning: false });
  });

  it("moves a code to Warnings when its type is changed and saved", () => {
    render(<PetCodeCatalogue />);
    fireEvent.click(screen.getByRole("button", { name: "Edit ✂5f" }));
    expect(typeSelect().value).toBe("code");
    fireEvent.change(typeSelect(), { target: { value: "warning" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ id: 2, code: "✂5f", isWarning: true });
  });

  it("will not let an aggression code be made a plain code", () => {
    render(<PetCodeCatalogue />);
    showWarnings();
    fireEvent.click(screen.getByRole("button", { name: "Edit DOG AGGRESSIVE" }));
    expect(typeSelect().value).toBe("warning");
    expect(typeSelect()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update.mock.calls[0][0]).toMatchObject({ id: 3, isWarning: true });
  });
});

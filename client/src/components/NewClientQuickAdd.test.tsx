import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createClient = vi.fn();
const createPet = vi.fn();

// Hoisted above the imports, so the stub is built inside the factory.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    clients: { create: { useMutation: () => ({ mutateAsync: createClient, isPending: false }) } },
    pets: { create: { useMutation: () => ({ mutateAsync: createPet, isPending: false }) } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NewClientQuickAdd } from "./NewClientQuickAdd";

/**
 * Adding a client without leaving the booking.
 *
 * The transport is stubbed — there is no server in a test — but what the
 * component sends is asserted exactly, because that is the part that breaks:
 * a field renamed on the procedure would otherwise sail through.
 */
describe("NewClientQuickAdd", () => {
  beforeEach(() => {
    createClient.mockReset().mockResolvedValue({ success: true, id: 4242 });
    createPet.mockReset().mockResolvedValue({ success: true, id: 99 });
  });

  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog's name *"), "Ralph");
  };

  it("will not save until it has a name and a dog", async () => {
    const user = userEvent.setup();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);

    const save = screen.getByRole("button", { name: /add and book/i });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("First name *"), "Kim");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    // Still not enough: a client with no dog cannot be booked, which is the
    // whole purpose of this form.
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Dog's name *"), "Ralph");
    expect(save).toBeEnabled();
  });

  it("creates the client, then the dog, and hands both back", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<NewClientQuickAdd onCreated={onCreated} onCancel={vi.fn()} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createClient).toHaveBeenCalledWith({
      firstName: "Kim",
      lastName: "Dahl",
      phone: undefined,
    });
    // The dog is attached to the client that was just created, not to
    // whatever was selected before.
    expect(createPet).toHaveBeenCalledWith({ clientId: 4242, name: "Ralph" });
    expect(onCreated).toHaveBeenCalledWith({ clientId: 4242, petId: 99, petName: "Ralph" });
  });

  it("trims what was typed", async () => {
    const user = userEvent.setup();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("First name *"), "  Kim  ");
    await user.type(screen.getByLabelText("Last name *"), " Dahl ");
    await user.type(screen.getByLabelText("Dog's name *"), " Ralph ");
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Kim", lastName: "Dahl" }),
    );
    expect(createPet).toHaveBeenCalledWith(expect.objectContaining({ name: "Ralph" }));
  });

  it("sends a phone number only when one was given", async () => {
    const user = userEvent.setup();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    await fill(user);
    await user.type(screen.getByLabelText("Phone"), "0417767765");
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "0417767765" }),
    );
  });

  it("keeps the client when creating the dog fails", async () => {
    // Deliberate: the client is already saved, so losing them because the
    // pet insert failed would throw away details taken over the phone.
    const user = userEvent.setup();
    const onCreated = vi.fn();
    createPet.mockRejectedValue(new Error("Pet name is required"));
    render(<NewClientQuickAdd onCreated={onCreated} onCancel={vi.fn()} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
    // And the form is usable again rather than stuck on "saving".
    expect(screen.getByRole("button", { name: /add and book/i })).toBeEnabled();
  });

  it("does not create anything when cancelled", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={onCancel} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(createPet).not.toHaveBeenCalled();
  });
});

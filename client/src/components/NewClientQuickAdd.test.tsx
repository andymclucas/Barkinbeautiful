import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";


/**
 * Typing with no inter-keystroke delay.
 *
 * setupUser() schedules each keystroke through real timers.
 * Under a loaded vitest worker those keystrokes arrive late, the
 * component has not re-rendered by the time the next assertion runs,
 * and a test fails on timing rather than on behaviour.
 *
 * It bit on 30/10/2026: this file failed twice in full-suite runs — a
 * DIFFERENT test each time — then passed three runs straight. A suite
 * that fails at random is worse than a slow one, because CLAUDE.md §7
 * tells the next person that any failure here is real.
 *
 * delay: null dispatches the events synchronously. Nothing these
 * tests assert changes.
 */
const setupUser = () => userEvent.setup({ delay: null });

const createClient = vi.fn();
const createPet = vi.fn();

// Hoisted above the imports, so the stub is built inside the factory.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    clients: { create: { useMutation: () => ({ mutateAsync: createClient, isPending: false }) } },
    pets: {
      create: { useMutation: () => ({ mutateAsync: createPet, isPending: false }) },
      // BreedInput offers the salon's own breed list. Stubbed empty: the
      // datalist is a convenience and the field takes free text either
      // way, which is what these tests are about.
      listBreeds: { useQuery: () => ({ data: [] }) },
    },
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
// Top level, not inside the first describe: the spies are module-level and
// the blocks below are siblings, so a reset scoped to one of them leaves
// the others accumulating calls from whatever ran before.
beforeEach(() => {
  createClient.mockReset().mockResolvedValue({ success: true, id: 4242 });
  createPet.mockReset().mockResolvedValue({ success: true, id: 99 });
});

describe("NewClientQuickAdd", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
  };

  it("will not save until it has a name and a dog", async () => {
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);

    const save = screen.getByRole("button", { name: /add and book/i });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("First name *"), "Kim");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    // Still not enough: a client with no dog cannot be booked, which is the
    // whole purpose of this form.
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
    expect(save).toBeEnabled();
  });

  it("creates the client, then the dog, and hands both back", async () => {
    const user = setupUser();
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
    expect(onCreated).toHaveBeenCalledWith({
      clientId: 4242, firstName: "Kim", lastName: "Dahl",
      petIds: [99], petNames: ["Ralph"],
    });
  });

  it("trims what was typed", async () => {
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("First name *"), "  Kim  ");
    await user.type(screen.getByLabelText("Last name *"), " Dahl ");
    await user.type(screen.getByLabelText("Dog 1 name"), " Ralph ");
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Kim", lastName: "Dahl" }),
    );
    expect(createPet).toHaveBeenCalledWith(expect.objectContaining({ name: "Ralph" }));
  });

  it("sends a phone number only when one was given", async () => {
    const user = setupUser();
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
    const user = setupUser();
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
    const user = setupUser();
    const onCancel = vi.fn();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={onCancel} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(createPet).not.toHaveBeenCalled();
  });
});

/**
 * The three things Lauren hit on 23/10/2026: "tried to add new client
 * with 2 dogs. it only lets me add 1, still no breed area. then also
 * noticed it changed the clients name to the number".
 */
describe("a family with more than one dog", () => {
  it("adds another dog row on demand", async () => {
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByTestId("qa-dog")).toHaveLength(1);
    await user.click(screen.getByTestId("qa-add-dog"));
    expect(screen.getAllByTestId("qa-dog")).toHaveLength(2);
  });

  it("creates every dog, in the order they were typed", async () => {
    const user = setupUser();
    const onCreated = vi.fn();
    createPet.mockReset()
      .mockResolvedValueOnce({ success: true, id: 101 })
      .mockResolvedValueOnce({ success: true, id: 102 });
    render(<NewClientQuickAdd onCreated={onCreated} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
    await user.click(screen.getByTestId("qa-add-dog"));
    await user.type(screen.getByLabelText("Dog 2 name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createPet).toHaveBeenCalledTimes(2);
    expect(createPet).toHaveBeenNthCalledWith(1, { clientId: 4242, name: "Ralph" });
    expect(createPet).toHaveBeenNthCalledWith(2, { clientId: 4242, name: "Biscuit" });
    // Both are handed back, so the booking selects both rather than one.
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      petIds: [101, 102], petNames: ["Ralph", "Biscuit"],
    }));
  });

  it("ignores an empty extra row rather than creating a nameless dog", async () => {
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
    await user.click(screen.getByTestId("qa-add-dog"));
    await user.click(screen.getByRole("button", { name: /add and book/i }));
    expect(createPet).toHaveBeenCalledTimes(1);
  });

  it("lets a row be removed again", async () => {
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByTestId("qa-add-dog"));
    await user.click(screen.getByLabelText("Remove dog 2"));
    expect(screen.getAllByTestId("qa-dog")).toHaveLength(1);
  });

  it("has no Remove on the only dog", async () => {
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText("Remove dog 1")).not.toBeInTheDocument();
  });
});

describe("breed", () => {
  it("is asked for, and sent", async () => {
    // It was omitted on purpose and the omission was wrong: breed is
    // asked on the phone anyway, so not capturing it means typing twice.
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
    await user.type(screen.getByPlaceholderText("Breed"), "Cavoodle");
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(createPet).toHaveBeenCalledWith(expect.objectContaining({ breed: "Cavoodle" }));
  });

  it("is left out of the payload when blank", async () => {
    const user = setupUser();
    render(<NewClientQuickAdd onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
    await user.click(screen.getByRole("button", { name: /add and book/i }));
    expect(createPet).toHaveBeenCalledWith({ clientId: 4242, name: "Ralph" });
  });
});

describe("the name handed back", () => {
  it("includes the client's name, not just the id", async () => {
    // Without it the booking dialog showed "Client #420002": the picker
    // looks names up in a SEARCH query, and a client created a second
    // ago is not in those results.
    const user = setupUser();
    const onCreated = vi.fn();
    render(<NewClientQuickAdd onCreated={onCreated} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("First name *"), "Kim");
    await user.type(screen.getByLabelText("Last name *"), "Dahl");
    await user.type(screen.getByLabelText("Dog 1 name"), "Ralph");
    await user.click(screen.getByRole("button", { name: /add and book/i }));

    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      firstName: "Kim", lastName: "Dahl",
    }));
  });
});

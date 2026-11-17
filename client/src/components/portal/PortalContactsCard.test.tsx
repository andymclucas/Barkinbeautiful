import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalContactsCard, type PortalContact } from "./PortalContactsCard";

const sam: PortalContact = { id: 7, name: "Sam Example", phone: "0412345678", relationship: "Daughter" };

function setup(over: Partial<Parameters<typeof PortalContactsCard>[0]> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(<PortalContactsCard contacts={[]} canAdd saving={false} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} {...over} />);
  return { onAdd, onUpdate, onRemove };
}

describe("PortalContactsCard", () => {
  it("says so when there are none, and offers to add one", () => {
    setup();
    expect(screen.getByText("No other contacts yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a contact" })).toBeInTheDocument();
  });

  it("lists each contact with who they are", () => {
    setup({ contacts: [sam] });
    expect(screen.getByText("Sam Example")).toBeInTheDocument();
    expect(screen.getByText("(Daughter)")).toBeInTheDocument();
    expect(screen.getByText("0412345678")).toBeInTheDocument();
  });

  it("hides Add once the client holds as many as allowed", () => {
    setup({ contacts: [sam], canAdd: false });
    expect(screen.queryByRole("button", { name: "Add a contact" })).toBeNull();
  });

  it("points out a missing number instead of sending it", async () => {
    const { onAdd } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add a contact" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    expect(await screen.findByText("Please enter their phone number.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("sends a new contact and closes the form once it is saved", async () => {
    const { onAdd } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add a contact" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Sam Example" } });
    fireEvent.change(screen.getByLabelText("Their phone number"), { target: { value: "0412 345 678" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: "Sam Example", phone: "0412 345 678", relationship: "" }));
    await waitFor(() => expect(screen.queryByLabelText("Their name")).toBeNull());
  });

  it("opens an existing contact filled in, and saves the correction against its id", async () => {
    const { onUpdate } = setup({ contacts: [sam] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Sam Example" }));
    expect(screen.getByLabelText("Their name")).toHaveValue("Sam Example");
    fireEvent.change(screen.getByLabelText("Their phone number"), { target: { value: "0498765432" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(7, { name: "Sam Example", phone: "0498765432", relationship: "Daughter" }));
  });

  it("lets a name be corrected on a contact whose number the salon typed its own way", async () => {
    const { onUpdate } = setup({ contacts: [{ ...sam, phone: "4152 1234 (work)" }] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Sam Example" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Sam Sample" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(7, { name: "Sam Sample", phone: "4152 1234 (work)", relationship: "Daughter" }));
  });

  it("asks before removing, and removes nothing until the answer is yes", async () => {
    const { onRemove } = setup({ contacts: [sam] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Sam Example" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove contact" }));
    expect(screen.getByText("Remove Sam Example?")).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText("Remove Sam Example?")).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByLabelText("Their name")).toBeNull());
  });

  it("offers no Remove while adding a new contact", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add a contact" }));
    expect(screen.queryByRole("button", { name: "Remove contact" })).toBeNull();
  });

  it("keeps the form open when the save did not go through", async () => {
    const failing = vi.fn().mockResolvedValue(false);
    setup({ onAdd: failing });
    fireEvent.click(screen.getByRole("button", { name: "Add a contact" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Their phone number"), { target: { value: "0412345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(failing).toHaveBeenCalled());
    expect(screen.getByLabelText("Their name")).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { WorkflowKanban } from "./WorkflowKanban";
import type { BoardActions, StaffLite } from "./WorkflowBoardTable";

const dog = (id: number, petName: string, workflowState: string, over: Record<string, unknown> = {}) => ({
  id,
  petId: id * 10,
  petName,
  clientLastName: "Auld",
  workflowState,
  serviceType: "classic_groom",
  scheduledStart: new Date(Date.UTC(2026, 10, 23, 21, id)),
  staffId: 1,
  bathStaffId: 2,
  dryStaffId: 2,
  checkedInAt: Date.UTC(2026, 10, 23, 21),
  stageStartedAt: new Date(Date.UTC(2026, 10, 23, 21, 30)),
  ...over,
});

const staff: StaffLite[] = [
  { id: 1, name: "Brooke Smith", role: "groomer" },
  { id: 2, name: "Sabina Lee", role: "bather" },
];

function actions(over: Partial<BoardActions> = {}): BoardActions {
  const noop = vi.fn();
  return {
    update: vi.fn(), updateStagePending: false, advanceStage: vi.fn(), toggleAddOnDone: noop, revertStage: noop,
    dragApptId: { current: null }, boardData: undefined, completeAppointment: noop, setPetPopup: noop,
    setEditingNotes: noop, setOutConfirm: vi.fn(), familyFilter: null, setFamilyFilter: noop,
    setFamilyLinkPopup: noop, setFamilySearch: noop, setBathPriority: { isPending: false, mutate: noop },
    bathGroupCandidates: [], setBathGroupPopup: noop, setBathGroupSelectedIds: noop, setBathGroupPriority: noop,
    ...over,
  };
}

const renderKanban = (rows: any[], a = actions(), showOut = false, readOnly = false) =>
  render(<WorkflowKanban rows={rows} now={Date.UTC(2026, 10, 23, 22)} bathers={staff} groomers={staff} actions={a} showOut={showOut} readOnly={readOnly} />);

const column = (label: RegExp) => screen.getByRole("region", { name: label });

describe("Simple mode columns", () => {
  it("puts each dog's card in the area it is in", () => {
    renderKanban([dog(1, "Rosie", "bathing"), dog(2, "Lola", "waiting_for_dry"), dog(3, "Pip", "grooming"), dog(4, "Milo", "scheduled")]);
    expect(within(column(/^Bath, 1 dog/)).getByText("Rosie")).toBeInTheDocument();
    expect(within(column(/^Dry, 1 dog/)).getByText("Lola")).toBeInTheDocument();
    expect(within(column(/^Groom, 1 dog/)).getByText("Pip")).toBeInTheDocument();
    expect(within(column(/^Arriving, 1 dog/)).getByText("Milo")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Out/ })).toBeNull();
  });

  it("shows the Out column only with finished dogs shown", () => {
    renderKanban([dog(1, "Rosie", "complete")], actions(), true);
    expect(within(column(/^Out, 1 dog/)).getByText("Rosie")).toBeInTheDocument();
  });

  it("moves a dog on with the card's button, through the board's own action", () => {
    const a = actions();
    const rosie = dog(1, "Rosie", "bathing");
    renderKanban([rosie], a);
    fireEvent.click(screen.getByRole("button", { name: "Move Rosie to Wait for Dry" }));
    expect(a.advanceStage).toHaveBeenCalledWith(rosie);
  });

  it("dragging a card to another area moves the dog there", () => {
    const a = actions();
    renderKanban([dog(1, "Rosie", "bathing")], a);
    fireEvent.dragStart(screen.getByText("Rosie").closest("[data-kanban-card]")!);
    fireEvent.drop(column(/^Dry/));
    expect(a.update).toHaveBeenCalledWith(1, { workflowState: "drying" }, { petName: "Rosie" });
  });

  it("dragging a card to Out asks first instead of sending the dog home", () => {
    const a = actions();
    renderKanban([dog(1, "Rosie", "ready")], a, true);
    fireEvent.dragStart(screen.getByText("Rosie").closest("[data-kanban-card]")!);
    fireEvent.drop(column(/^Out/));
    expect(a.setOutConfirm).toHaveBeenCalledWith({ id: 1, petName: "Rosie" });
    expect(a.update).not.toHaveBeenCalled();
  });

  it("marks a dog with an alert so the warning is one tap away", () => {
    renderKanban([dog(1, "Rosie", "bathing", { petAlertLevel: "danger" }), dog(2, "Lola", "bathing", { petMoegoCodeLabels: "✂4f, #7f" })]);
    expect(screen.getByRole("button", { name: "Warning for Rosie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pet codes for Lola" })).toBeInTheDocument();
    // The codes themselves are not printed on the card.
    expect(screen.queryByText("#7f")).toBeNull();
  });

  it("offers no move buttons on a read-only screen", () => {
    renderKanban([dog(1, "Rosie", "bathing")], actions(), false, true);
    expect(screen.queryByRole("button", { name: /^Move Rosie/ })).toBeNull();
  });
});

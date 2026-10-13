import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowBoardTable, type BoardActions, type StaffLite } from "./WorkflowBoardTable";

/**
 * The first real component test in this project.
 *
 * Until now client behaviour was "tested" by reading .tsx source and
 * asserting on substrings — CLAUDE.md §7 describes why that is bad and
 * names this as the durable fix. The cage/tag test it replaces asserted
 * Tailwind class strings appeared somewhere in two concatenated files; it
 * could not tell whether anything rendered, whether the inputs existed, or
 * whether a groomer could reach them.
 *
 * The board table is the right place to start: it is the screen the salon
 * works from all day, it takes plain props with no tRPC or context, and it
 * serves three surfaces (staff board, TV overlay, wall display) from one
 * component, so a regression here shows up in all three.
 */

/** One dog on the board. `rows` is `any[]`, so this is only what is read. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  petId: 10,
  petName: "Marlo",
  clientFirstName: "Anthony",
  clientLastName: "Tulley-Smith",
  workflowState: "grooming",
  serviceType: "classic_groom",
  scheduledStart: new Date("2026-10-13T22:30:00Z"),
  scheduledEnd: new Date("2026-10-13T23:30:00Z"),
  staffId: 1,
  bathStaffId: null,
  dryStaffId: null,
  cageNumber: null,
  tagNumber: null,
  price: "125.00",
  stageStartedAt: new Date("2026-10-13T22:40:00Z"),
  ...over,
});

const staff: StaffLite[] = [
  { id: 1, name: "Lauren Romari", role: "owner" },
  { id: 2, name: "Brooklyn Cossey", role: "groomer" },
];

/**
 * A complete set of board callbacks, every one a spy.
 *
 * Complete on purpose: the component only falls back to its own no-ops when
 * `actions` is absent entirely, so a partial object crashes on the first
 * field it is missing. TypeScript catches that in app code; a test passing
 * an untyped literal would not.
 */
function boardActions(over: Partial<BoardActions> = {}): BoardActions {
  const noop = vi.fn();
  return {
    update: vi.fn(),
    updateStagePending: false,
    advanceStage: vi.fn(),
    revertStage: vi.fn(),
    dragApptId: { current: null },
    boardData: undefined,
    completeAppointment: vi.fn(),
    setPetPopup: noop,
    setEditingNotes: noop,
    setOutConfirm: noop,
    familyFilter: null,
    setFamilyFilter: noop,
    setFamilyLinkPopup: noop,
    setFamilySearch: noop,
    setBathPriority: { isPending: false, mutate: vi.fn() },
    bathGroupCandidates: [],
    setBathGroupPopup: noop,
    setBathGroupSelectedIds: noop,
    setBathGroupPriority: noop,
    ...over,
  };
}

function renderBoard(over: Record<string, unknown> = {}, rows = [row()]) {
  return render(
    <WorkflowBoardTable
      rows={rows}
      now={new Date("2026-10-13T23:00:00Z").getTime()}
      bathers={staff}
      groomers={staff}
      bathQueueByAppointmentId={new Map()}
      {...over}
    />,
  );
}

describe("WorkflowBoardTable", () => {
  it("renders the dog on the board", () => {
    renderBoard();
    expect(screen.getByText("Marlo")).toBeInTheDocument();
  });

  it("gives Cage and Tag their own labelled inputs", () => {
    // The old test asserted the source contained the template literal
    // `aria-label={\`Enter ${label} number\`}`. That proves the string was
    // written, not that two distinct, reachable inputs exist on the board.
    renderBoard();
    expect(screen.getByLabelText("Enter Cage number")).toBeInTheDocument();
    expect(screen.getByLabelText("Enter Tag number")).toBeInTheDocument();
  });

  it("keeps Cage and Tag visually distinct", () => {
    // The palette consolidation collapsed both to violet once. Asserted on
    // the rendered cells rather than on class strings in a source file.
    renderBoard();
    const cage = screen.getByLabelText("Enter Cage number").closest("td");
    const tag = screen.getByLabelText("Enter Tag number").closest("td");
    expect(cage).not.toBeNull();
    expect(tag).not.toBeNull();
    expect(cage!.className).not.toBe(tag!.className);
    expect(cage!.className).toMatch(/blue/);
    expect(tag!.className).toMatch(/violet/);
  });

  it("keeps the Cage and Tag column headers distinct too", () => {
    // Both the header and the cell carry the colour. The old test asserted
    // the two header class strings appeared somewhere in the file; this
    // asserts the rendered headers exist and do not match each other.
    renderBoard();
    const cage = screen.getByRole("columnheader", { name: "Cage" });
    const tag = screen.getByRole("columnheader", { name: "Tag" });
    expect(cage.className).not.toBe(tag.className);
    expect(cage.className).toMatch(/blue/);
    expect(tag.className).toMatch(/violet/);
  });

  it("shows a cage number that has been set", () => {
    renderBoard({}, [row({ cageNumber: 7 })]);
    expect(screen.getByLabelText("Enter Cage number")).toHaveTextContent("7");
  });

  it("drops the editing affordances on a read-only surface", () => {
    // The wall display and the TV overlay pass readOnly. They must look the
    // same and change nothing — that is the whole reason three tables were
    // collapsed into one.
    renderBoard({ readOnly: true });
    expect(screen.getByText("Marlo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enter Cage number")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enter Tag number")).not.toBeInTheDocument();
  });

  it("renders a dog without touching any callback", () => {
    // Rendering must be a pure read. The board re-renders on a timer, so a
    // callback fired during render would hammer the server once a second.
    const actions = boardActions();
    renderBoard({ actions });
    expect(screen.getByText("Marlo")).toBeInTheDocument();
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.advanceStage).not.toHaveBeenCalled();
    expect(actions.completeAppointment).not.toHaveBeenCalled();
  });
});

describe("the contact person", () => {
  const withContact = row({
    contactId: 7,
    contactName: "Christie McLucas",
    contactRelationship: "Wife",
    contactPhone: "0407576731",
  });

  it("names who to ring on the staff board", () => {
    // Lauren was writing "Tx + Rochelle" on the whiteboard because there
    // was nowhere in here to put it.
    renderBoard({ showContact: true }, [withContact]);
    expect(screen.getByText(/Christie McLucas \(Wife\)/)).toBeInTheDocument();
  });

  it("hides it by default, which is what the wall screens get", () => {
    // WorkflowDisplay and the board's tvMode hang above the waiting area.
    // A client's wife's name does not belong on them, and the default has
    // to be private so a new surface is safe without anyone remembering.
    renderBoard({}, [withContact]);
    expect(screen.queryByText(/Christie McLucas/)).not.toBeInTheDocument();
  });

  it("stays quiet for a booking that is for the owner", () => {
    // The owner's surname is already on the row above; repeating it on
    // every card would be noise.
    renderBoard({ showContact: true }, [row({ contactId: null })]);
    expect(screen.queryByText(/☎/)).not.toBeInTheDocument();
  });

  it("stays quiet when the contact has been deleted from the record", () => {
    // contactId set, join found nothing. A bare phone icon would be worse.
    renderBoard({ showContact: true }, [row({ contactId: 7, contactName: null })]);
    expect(screen.queryByText(/☎/)).not.toBeInTheDocument();
  });

  it("keeps the owner's name visible either way", () => {
    renderBoard({}, [withContact]);
    expect(screen.getByText("Tulley-Smith")).toBeInTheDocument();
  });
});

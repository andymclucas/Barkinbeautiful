import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const joinMutate = vi.fn();
const updateMutate = vi.fn();
let joinPending = false;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ waitlist: { listEntries: { invalidate: vi.fn() } } }),
    staff: { listOperational: { useQuery: () => ({ data: [{ id: 1, name: "Megan Graham" }] }) } },
    waitlist: {
      join: { useMutation: () => ({ mutate: joinMutate, isPending: joinPending }) },
      update: { useMutation: () => ({ mutate: updateMutate, isPending: false }) },
      remove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  AddKnownClientToWaitlist, EditWaitlistEntry, defaultWaitlistWindow, waitlistJoinInput, emptyWaitlistFields,
} from "./WaitlistEntryFields";

const LINK = { id: 1574, name: "Link" };
const BELLE = { id: 2001, name: "Belle" };

describe("AddKnownClientToWaitlist", () => {
  beforeEach(() => { joinMutate.mockClear(); joinPending = false; });

  /*
   * Andy, 04/11/2026: "Add a quick action of 'add to waitlist' option."
   * The point of putting it here rather than on the calendar is that
   * the client is already known, so nothing asks who they are.
   */
  it("never asks which client — that is the page you are on", () => {
    render(<AddKnownClientToWaitlist clientId={1162} pets={[LINK]} />);
    expect(screen.queryByPlaceholderText(/Search a client/i)).not.toBeInTheDocument();
  });

  it("does not ask which of one dog", () => {
    render(<AddKnownClientToWaitlist clientId={1162} pets={[LINK]} />);
    expect(screen.queryByText("Dog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to waitlist/ })).toBeEnabled();
  });

  it("asks which dogs when there is more than one, and waits for an answer", () => {
    render(<AddKnownClientToWaitlist clientId={1162} pets={[LINK, BELLE]} />);
    expect(screen.getByText("Dogs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to waitlist/ })).toBeDisabled();
  });

  /* Andy, 11/11/2026: "Only one dog able to be added to the waitlist." */
  it("puts both dogs on one entry when both are ticked", () => {
    render(<AddKnownClientToWaitlist clientId={1162} pets={[LINK, BELLE]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Belle" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: /Add to waitlist/ }));
    // In the order the dogs are listed, not the order they were ticked.
    expect(joinMutate.mock.calls[0][0]).toMatchObject({ clientId: 1162, petIds: [1574, 2001] });
  });

  /*
   * A departed dog cannot wait for a cancellation, so a client whose
   * dogs have all been retired gets a sentence rather than a form that
   * cannot be submitted.
   */
  it("says so plainly when the client has no active dogs", () => {
    render(<AddKnownClientToWaitlist clientId={1162} pets={[]} />);
    expect(screen.getByText(/no active dogs/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add to waitlist/ })).not.toBeInTheDocument();
  });

  it("sends the client, the dog and the window", () => {
    render(<AddKnownClientToWaitlist clientId={1162} pets={[LINK]} />);
    fireEvent.click(screen.getByRole("button", { name: /Add to waitlist/ }));
    expect(joinMutate).toHaveBeenCalledTimes(1);
    const sent = joinMutate.mock.calls[0][0];
    expect(sent).toMatchObject({ clientId: 1162, petIds: [1574], timeOfDay: "any" });
    expect(sent.earliestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent.latestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("cannot be double-submitted while it is saving", () => {
    joinPending = true;
    render(<AddKnownClientToWaitlist clientId={1162} pets={[LINK]} />);
    expect(screen.getByRole("button", { name: /Adding/ })).toBeDisabled();
  });
});

describe("the window the form opens with", () => {
  it("runs from today to sixty days out", () => {
    const { earliestDate, latestDate } = defaultWaitlistWindow();
    const days = (Date.parse(latestDate) - Date.parse(earliestDate)) / 86_400_000;
    expect(Math.round(days)).toBe(60);
  });

  /*
   * MAX_WAITLIST_WINDOW_DAYS is 120 and the procedure rejects anything
   * past it, so the default must not open already-invalid.
   */
  it("opens well inside what the server will accept", () => {
    const { earliestDate, latestDate } = defaultWaitlistWindow();
    expect((Date.parse(latestDate) - Date.parse(earliestDate)) / 86_400_000).toBeLessThan(120);
  });
});

describe("waitlistJoinInput", () => {
  it("drops an empty note and an unset groomer rather than sending blanks", () => {
    const sent = waitlistJoinInput(1162, 1574, { ...emptyWaitlistFields(), note: "   " });
    expect(sent.note).toBeUndefined();
    expect(sent.preferredStaffId).toBeUndefined();
  });

  it("passes a groomer preference through as a number", () => {
    const sent = waitlistJoinInput(1162, 1574, { ...emptyWaitlistFields(), staffId: "7", note: " late pickup " });
    expect(sent.preferredStaffId).toBe(7);
    expect(sent.note).toBe("late pickup");
  });
});


describe("changing the dogs on an entry (11/11/2026)", () => {
  const entry = {
    id: 90001, petName: "Link", petIds: [1574], earliestDate: "2026-11-11", latestDate: "2026-12-18",
    timeOfDay: "any", preferredStaffId: null, note: null,
  };
  beforeEach(() => updateMutate.mockClear());

  it("adds a second dog to the same entry, keeping its place", () => {
    render(<EditWaitlistEntry entry={entry} pets={[LINK, BELLE]} />);
    expect(screen.getByRole("checkbox", { name: "Link" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Belle" }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ entryId: 90001, petIds: [1574, 2001] });
  });

  it("will not save an entry with no dog on it", () => {
    render(<EditWaitlistEntry entry={entry} pets={[LINK, BELLE]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Link" }));
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  });

  it("leaves the dogs alone when there is only one to choose", () => {
    render(<EditWaitlistEntry entry={entry} pets={[LINK]} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(updateMutate.mock.calls[0][0].petIds).toBeUndefined();
  });
});

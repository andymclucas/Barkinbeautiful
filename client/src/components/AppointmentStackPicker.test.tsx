import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppointmentStackPicker, type StackedAppointment } from "./AppointmentStackPicker";

/**
 * The picker is the only way to reach an appointment buried under
 * another one, so "it renders and the rows are clickable" is the whole
 * feature. A source grep could not have told us any of that — see
 * CLAUDE.md §7.
 */
const appt = (over: Partial<StackedAppointment> = {}): StackedAppointment => ({
  id: 1,
  time: "8:00 am",
  label: "Fergus Delaney",
  service: "Classic Groom",
  isCancelled: false,
  accent: "#16a34a",
  ...over,
});

const three = [
  appt({ id: 1, time: "8:00 am", label: "Fergus Delaney" }),
  appt({ id: 2, time: "8:30 am", label: "Archie & Lola Schmidt" }),
  appt({ id: 3, time: "9:00 am", label: "Kaia Hermann" }),
];

describe("AppointmentStackPicker", () => {
  it("lists every dog in the stack, not just the one on top", () => {
    render(
      <AppointmentStackPicker
        appointments={three}
        tappedId={3}
        open
        onOpenChange={() => {}}
        onPick={() => {}}
      />,
    );
    expect(screen.getByText("Fergus Delaney")).toBeInTheDocument();
    expect(screen.getByText("Archie & Lola Schmidt")).toBeInTheDocument();
    expect(screen.getByText("Kaia Hermann")).toBeInTheDocument();
    expect(screen.getByText("3 dogs at this time")).toBeInTheDocument();
  });

  it("opens the one that is picked, not the one that was tapped", async () => {
    const onPick = vi.fn();
    render(
      <AppointmentStackPicker
        appointments={three}
        tappedId={3}
        open
        onOpenChange={() => {}}
        onPick={onPick}
      />,
    );
    await userEvent.click(screen.getByText("Fergus Delaney"));
    expect(onPick).toHaveBeenCalledWith(1);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("marks the card that was actually tapped", () => {
    const { rerender } = render(
      <AppointmentStackPicker
        appointments={three}
        tappedId={2}
        open
        onOpenChange={() => {}}
        onPick={() => {}}
      />,
    );
    // One mark, and it sits on the row that was tapped.
    const marks = screen.getAllByText("Tapped");
    expect(marks).toHaveLength(1);
    expect(marks[0].closest("button")).toHaveTextContent("Archie & Lola Schmidt");

    rerender(
      <AppointmentStackPicker
        appointments={three}
        tappedId={null}
        open
        onOpenChange={() => {}}
        onPick={() => {}}
      />,
    );
    expect(screen.queryByText("Tapped")).not.toBeInTheDocument();
  });

  it("says which of the stack is cancelled, so it is not opened by mistake", () => {
    render(
      <AppointmentStackPicker
        appointments={[three[0], appt({ id: 2, label: "Archie Schmidt", isCancelled: true })]}
        tappedId={1}
        open
        onOpenChange={() => {}}
        onPick={() => {}}
      />,
    );
    expect(screen.getByText(/Classic Groom · cancelled/)).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(
      <AppointmentStackPicker
        appointments={three}
        tappedId={1}
        open={false}
        onOpenChange={() => {}}
        onPick={() => {}}
      />,
    );
    expect(screen.queryByText("Fergus Delaney")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateField } from "./DateField";

/** Synchronous keystrokes — see the note in NewClientQuickAdd.test.tsx. */
const setupUser = () => userEvent.setup({ delay: null });

const onChange = vi.fn();
const show = (value: string, props: Record<string, unknown> = {}) =>
  render(<DateField value={value} onChange={onChange} aria-label="Date" {...props} />);
const field = () => screen.getByLabelText("Date") as HTMLInputElement;

beforeEach(() => onChange.mockReset());

describe("DateField — what it shows", () => {
  it("writes the day first, whatever the browser's locale is", () => {
    // The whole point. A native date input renders in the BROWSER's locale
    // and showed 11/03/2026 for the 3rd of November on the salon machine.
    show("2026-11-03");
    expect(field().value).toBe("03/11/2026");
  });

  it("is a text input, which is WHY the locale cannot reach it", () => {
    // Guards the fix itself: swapping this back to type="date" would look
    // identical on an Australian machine and be wrong on Lauren's.
    show("2026-11-03");
    expect(field().type).toBe("text");
  });

  it("shows an empty field rather than a placeholder date", () => {
    show("");
    expect(field().value).toBe("");
    expect(field()).toHaveAttribute("placeholder", "DD/MM/YYYY");
  });
});

describe("DateField — typing", () => {
  it("reads what was typed the Australian way round", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.type(field(), "30/10/2026{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-10-30");
  });

  it("commits on blur as well as on Enter", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.type(field(), "30/10/2026");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("2026-10-30");
  });

  it("does not fight the typist mid-date", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.type(field(), "3/1");
    // "3/1" parses as the 3rd of January, but they are probably heading for
    // the 3rd of November. Nothing is committed until they finish.
    expect(onChange).not.toHaveBeenCalled();
    expect(field().value).toBe("3/1");
  });

  it("puts back the last good value when the text is not a date", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.type(field(), "rubbish{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(field().value).toBe("03/11/2026");
  });

  it("refuses a day that does not exist rather than rolling it forward", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.type(field(), "31/02/2026{Enter}");
    // new Date("2026-02-31") is the 3rd of March. Silently saving that
    // would book a dog on a day nobody chose.
    expect(onChange).not.toHaveBeenCalled();
    expect(field().value).toBe("03/11/2026");
  });

  it("reverts on Escape", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.type(field(), "30/10/2026{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(field().value).toBe("03/11/2026");
  });

  it("clears to empty when the field is emptied", async () => {
    const user = setupUser();
    show("2026-11-03");
    await user.clear(field());
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("DateField — following the parent", () => {
  it("updates when the parent changes the value", () => {
    // The board's < > arrows and its Today button do exactly this.
    const { rerender } = show("2026-11-03");
    expect(field().value).toBe("03/11/2026");
    rerender(<DateField value="2026-11-04" onChange={onChange} aria-label="Date" />);
    expect(field().value).toBe("04/11/2026");
  });
});

describe("DateField — min and max", () => {
  it("refuses a date before min", async () => {
    const user = setupUser();
    show("2026-11-03", { min: "2026-11-01" });
    await user.clear(field());
    await user.type(field(), "31/10/2026{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a date after max", async () => {
    const user = setupUser();
    show("2026-11-03", { max: "2026-11-30" });
    await user.clear(field());
    await user.type(field(), "01/12/2026{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows a date inside the range", async () => {
    const user = setupUser();
    show("2026-11-03", { min: "2026-11-01", max: "2026-11-30" });
    await user.clear(field());
    await user.type(field(), "15/11/2026{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-11-15");
  });
});

describe("DateField — the calendar", () => {
  it("offers a calendar for picking a day near today", async () => {
    const user = setupUser();
    show("2026-11-03");
    const open = screen.getByRole("button", { name: "Open the calendar" });
    await user.click(open);
    // react-day-picker renders a grid; its presence is what is being
    // asserted, not its internals.
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    cleanup();
  });
});

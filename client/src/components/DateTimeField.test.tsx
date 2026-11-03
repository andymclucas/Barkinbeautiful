import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimeField } from "./DateTimeField";

const setupUser = () => userEvent.setup({ delay: null });

const onChange = vi.fn();
const show = (value: string, props: Record<string, unknown> = {}) =>
  render(<DateTimeField value={value} onChange={onChange} aria-label="Starts" {...props} />);
const dateBox = () => screen.getByLabelText("Starts date") as HTMLInputElement;
const timeBox = () => screen.getByLabelText("Starts time") as HTMLInputElement;

beforeEach(() => onChange.mockReset());

describe("DateTimeField — what it shows", () => {
  it("splits the value and writes the date day-first", () => {
    show("2026-11-03T09:00");
    expect(dateBox().value).toBe("03/11/2026");
    expect(timeBox().value).toBe("09:00");
  });

  it("leaves the time half native, since a time cannot be misread", () => {
    // 14:30 against 2:30 PM is a difference in style, not in meaning - and
    // the native picker beats anything worth hand-rolling, on a phone most
    // of all. Control what can be misread; leave what cannot.
    show("2026-11-03T09:00");
    expect(timeBox().type).toBe("time");
    expect(dateBox().type).toBe("text");
  });

  it("shows both halves empty for an empty value", () => {
    show("");
    expect(dateBox().value).toBe("");
    expect(timeBox().value).toBe("");
  });
});

describe("DateTimeField — editing", () => {
  it("keeps the time when the date is changed", async () => {
    const user = setupUser();
    show("2026-11-03T09:00");
    await user.clear(dateBox());
    await user.type(dateBox(), "30/10/2026{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-30T09:00");
  });

  it("keeps the date when the time is changed", async () => {
    const user = setupUser();
    show("2026-11-03T09:00");
    await user.clear(timeBox());
    await user.type(timeBox(), "14:30");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T14:30");
  });

  it("does not wipe the time off screen when the date is cleared", async () => {
    // The trap. joinLocalDateTime returns "" when either half is missing,
    // so deriving both halves from `value` meant clearing one erased the
    // other - and the person had to retype something they never touched.
    const user = setupUser();
    show("2026-11-03T09:00");
    await user.clear(dateBox());
    await user.tab();
    expect(timeBox().value).toBe("09:00");
  });

  it("reports empty while only half is filled in, since that is not a time yet", async () => {
    const user = setupUser();
    show("2026-11-03T09:00");
    await user.clear(dateBox());
    await user.tab();
    // A date with no time is not a booking; "2026-11-03T" must never be saved.
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("gives a sensible hour when a date is typed into an empty field", async () => {
    const user = setupUser();
    show("");
    await user.type(dateBox(), "03/11/2026{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T09:00");
  });
});

describe("DateTimeField — following the parent", () => {
  it("takes a value set from elsewhere", () => {
    // "Next available" on the booking dialog fills these in.
    const { rerender } = show("2026-11-03T09:00");
    rerender(<DateTimeField value="2026-11-05T13:15" onChange={onChange} aria-label="Starts" />);
    expect(dateBox().value).toBe("05/11/2026");
    expect(timeBox().value).toBe("13:15");
  });

  it("does not snap back a half-typed entry", async () => {
    // The parent has "" while only one half is filled; re-rendering with
    // that same "" must not clear what is on screen.
    const user = setupUser();
    const { rerender } = show("2026-11-03T09:00");
    await user.clear(dateBox());
    await user.tab();
    rerender(<DateTimeField value="" onChange={onChange} aria-label="Starts" />);
    expect(timeBox().value).toBe("09:00");
  });
});

describe("DateTimeField — disabled", () => {
  it("disables both halves together", () => {
    show("2026-11-03T09:00", { disabled: true });
    expect(dateBox()).toBeDisabled();
    expect(timeBox()).toBeDisabled();
  });
});

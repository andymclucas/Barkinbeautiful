import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "./dialog";

const setupUser = () => userEvent.setup({ delay: null });

/**
 * jsdom does no layout, so it cannot prove the X stays in the corner —
 * that was verified by measuring a real browser. What it CAN hold onto
 * is the structure the fix depends on, which is the part a later edit
 * would quietly undo.
 */
function Sample({
  onOpenChange = () => {},
  side,
}: { onOpenChange?: (o: boolean) => void; side?: "center" | "right" }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side={side}>
        <DialogHeader><DialogTitle>Edit appointment</DialogTitle></DialogHeader>
        <p>Body</p>
        <DialogFooter><button type="button">Save</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("DialogContent close button", () => {
  it("is there and closes the dialog", async () => {
    const onOpenChange = vi.fn();
    await setupUser().click(
      render(<Sample onOpenChange={onOpenChange} />).getByRole("button", { name: /close/i }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  /**
   * The close sits in a zero-height strip BEFORE the children, and that
   * strip cancels its own grid-row gap with `[&+*]:-mt-4`. Both halves
   * matter: moved back after the children, the selector would target
   * nothing and every dialog in the app would gain 16px above its
   * title. Measured in a real browser on 30/10/2026 — with and without
   * the strip the dialog was identically 148px tall.
   */
  it("sits before the dialog's own content, with the gap it adds taken back off", () => {
    render(<Sample />);
    const content = document.querySelector('[data-slot="dialog-content"]')!;
    const strip = screen.getByRole("button", { name: /close/i }).parentElement!;

    expect(content.firstElementChild).toBe(strip);
    expect(strip.className).toContain("[&+*]:-mt-4");
    expect(strip.nextElementSibling).toHaveAttribute("data-slot", "dialog-header");
  });

  /** Absolute is what made it scroll away in the first place. */
  it("is stuck to the top rather than absolutely placed", () => {
    render(<Sample />);
    const strip = screen.getByRole("button", { name: /close/i }).parentElement!;
    expect(strip.className).toContain("sticky");
    expect(strip.className).not.toContain("absolute");
  });

  it("does not swallow clicks across the width of the dialog", () => {
    render(<Sample />);
    const strip = screen.getByRole("button", { name: /close/i }).parentElement!;
    // The strip spans the full width to pin the X right, so it must let
    // pointer events through everywhere except the button itself.
    expect(strip.className).toContain("pointer-events-none");
    expect(screen.getByRole("button", { name: /close/i }).className)
      .toContain("pointer-events-auto");
  });
});

/**
 * The side-panel variant, added 08/11/2026 so the appointment card
 * arrives from the edge the way MoeGo's does.
 *
 * jsdom does no layout, so these pin the class contract rather than
 * proving anything is visually in the right place — same limitation the
 * close-button tests above describe. What they are really protecting is
 * the DEFAULT: forty-odd dialogs share this component and none of them
 * asked to move.
 */
describe("DialogContent side variant", () => {
  const content = () => document.querySelector('[data-slot="dialog-content"]')!;

  it("leaves every other dialog centred", () => {
    // The one that matters. A variant that changed the default would
    // move the whole app without anybody asking for it.
    render(<Sample />);
    const cls = content().className;
    expect(cls).toContain("translate-x-[-50%]");
    expect(cls).toContain("rounded-lg");
    expect(cls).not.toContain("slide-in-from-right");
  });

  it("pins a right-hand panel to the full height of the edge", () => {
    render(<Sample side="right" />);
    const cls = content().className;
    expect(cls).toContain("inset-y-0");
    expect(cls).toContain("right-0");
    expect(cls).toContain("h-full");
    expect(cls).toContain("slide-in-from-right");
    // Centring must be gone, or the panel is translated off the edge.
    expect(cls).not.toContain("translate-x-[-50%]");
    expect(cls).not.toContain("top-[50%]");
  });

  it("is full width on a phone and a fixed panel above sm", () => {
    // A side panel pinned to max-w-lg on a phone leaves a narrow strip
    // with the calendar showing through beside it, which is why the
    // Calendar passes no width class of its own.
    const cls = (render(<Sample side="right" />), content().className);
    expect(cls).toContain("max-w-full");
    expect(cls).toContain("sm:max-w-lg");
  });

  it("still scrolls, and still carries the sticky close button", () => {
    // Andy, 30/10/2026: "ensure the 'X' always is in the top right
    // corner so it's easy for the staff member to close it quickly."
    // The panel is the longest form in the app; losing either of these
    // in the move would be the regression worth catching.
    render(<Sample side="right" />);
    expect(content().className).toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
    expect(document.querySelector(".sticky")).not.toBeNull();
  });

  it("closes on the same path as a centred dialog", async () => {
    // The reason this is a variant of DialogContent rather than a move to
    // components/ui/sheet: Escape handling here runs through
    // DialogCompositionContext, so an IME composition cannot close the
    // panel and lose the edit. Sheet has no such context.
    const onOpenChange = vi.fn();
    await setupUser().click(
      render(<Sample side="right" onOpenChange={onOpenChange} />)
        .getByRole("button", { name: /close/i }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

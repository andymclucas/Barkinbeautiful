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
function Sample({ onOpenChange = () => {} }: { onOpenChange?: (o: boolean) => void }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTvMode } from "./tvMode";

const KEY = "workflow-tv-mode";

/** A stand-in for the board: enter TV mode, show which view is on screen, exit. */
function Board() {
  const { tvMode, enter, exit } = useTvMode();
  return tvMode
    ? <div><span>TV view</span><button onClick={exit}>Exit</button></div>
    : <div><span>Staff board</span><button onClick={enter}>TV Preview</button></div>;
}

/** What `window.location.reload()` does to React: everything mounts again. */
const reload = () => { cleanup(); render(<Board />); };

beforeEach(() => localStorage.clear());

describe("useTvMode", () => {
  it("starts on the staff board", () => {
    render(<Board />);
    expect(screen.getByText("Staff board")).toBeInTheDocument();
  });

  it("stays in TV mode across a reload", async () => {
    // The bug Lauren hit. The board reloads ITSELF in TV mode whenever a
    // new build ships, so the reload that exists to keep the wall screen
    // current was the thing dropping it back to the staff board.
    const user = userEvent.setup({ delay: null });
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "TV Preview" }));
    expect(screen.getByText("TV view")).toBeInTheDocument();

    reload();
    expect(screen.getByText("TV view")).toBeInTheDocument();
  });

  it("stays OUT of TV mode across a reload once exited", async () => {
    // The other half: a staff member who looked at the preview must not
    // find the TV view waiting for them tomorrow.
    const user = userEvent.setup({ delay: null });
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "TV Preview" }));
    await user.click(screen.getByRole("button", { name: "Exit" }));
    expect(screen.getByText("Staff board")).toBeInTheDocument();

    reload();
    expect(screen.getByText("Staff board")).toBeInTheDocument();
  });

  it("is per device, so it does not travel with the signed-in user", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "TV Preview" }));
    // The salon TV keeps being the salon TV whoever signs in on it; the
    // granularity is the screen in the corner, not the account.
    expect(localStorage.getItem(KEY)).toBe("on");
  });

  it("falls back to the staff board when storage is unavailable", () => {
    // Private browsing, or storage blocked. Defaulting to the staff board
    // is the safe way to be wrong: it is visible and one click to fix,
    // whereas defaulting to TV mode hides every control.
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Board />);
    expect(screen.getByText("Staff board")).toBeInTheDocument();
    getItem.mockRestore();
  });

  it("does not throw when storage refuses the write", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const user = userEvent.setup({ delay: null });
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "TV Preview" }));
    // The choice still applies for this session even though it is not saved.
    expect(screen.getByText("TV view")).toBeInTheDocument();
    setItem.mockRestore();
  });

  it("ignores a junk value rather than trusting it", () => {
    localStorage.setItem(KEY, "yes please");
    render(<Board />);
    expect(screen.getByText("Staff board")).toBeInTheDocument();
  });
});

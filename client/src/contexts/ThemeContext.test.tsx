import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/*
 * vi.hoisted, because vi.mock is lifted above every other statement in the
 * file and the factory here returns the spy directly - so a plain `const`
 * is still in its temporal dead zone when the factory runs. The trpc mocks
 * elsewhere get away with a bare const only because they reference their
 * spies from INSIDE a function, which is not called until render.
 */
const { playFestiveChime } = vi.hoisted(() => ({ playFestiveChime: vi.fn() }));
vi.mock("@/lib/festiveChime", () => ({ playFestiveChime }));

import { ThemeProvider, useTheme } from "./ThemeContext";

const setupUser = () => userEvent.setup({ delay: null });

/** A stand-in for the header's tree button, plus a direct setter. */
function Tree() {
  const { festive, toggleFestive, setFestive } = useTheme();
  return (
    <>
      <button onClick={toggleFestive}>{festive ? "Turn off" : "Turn on"}</button>
      <button onClick={() => setFestive(true)}>Set on</button>
    </>
  );
}
const show = () => render(<ThemeProvider><Tree /></ThemeProvider>);

beforeEach(() => {
  playFestiveChime.mockReset();
  localStorage.clear();
});

describe("the festive chime", () => {
  it("plays when the tree is switched on", async () => {
    const user = setupUser();
    show();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(playFestiveChime).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the tree is switched off", async () => {
    // Somebody switching the theme off may well be doing it because they
    // have had enough, and a jingle on the way out is the joke wearing
    // thin in the one moment it was never going to land.
    const user = setupUser();
    show();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    playFestiveChime.mockReset();
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(playFestiveChime).not.toHaveBeenCalled();
  });

  it("does NOT play on load when the theme is already on", () => {
    /*
     * The one that matters. The salon's wall TV reloads itself whenever a
     * new build ships and it sits in festive mode, so a chime on mount
     * would mean the board playing Jingle Bells to an empty room at every
     * deploy, with nobody near it to work out why.
     *
     * This holds because the initial value comes from useState's lazy
     * initialiser and never goes through setFestive - so it is a guard
     * against somebody later moving the chime into an effect, rather than
     * a test of the `!festive` condition. The test below covers that.
     */
    localStorage.setItem("gsos-festive", "on");
    show();
    expect(playFestiveChime).not.toHaveBeenCalled();
  });

  it("does not play again when something sets it on while it is already on", async () => {
    /*
     * This is what the `!festive` guard in setFestive is actually for, and
     * it is the only thing that exercises it - mounting never calls
     * setFestive at all, so the load case above passes with or without it.
     *
     * Nothing in the app sets it twice today. The guard is here because a
     * future caller that re-asserts the theme - a settings page, a URL
     * parameter, a sync between tabs - would otherwise chime every time it
     * confirmed what was already true.
     */
    const user = setupUser();
    localStorage.setItem("gsos-festive", "on");
    show();
    await user.click(screen.getByRole("button", { name: "Set on" }));
    expect(playFestiveChime).not.toHaveBeenCalled();
  });

  it("plays once per switch, not once per render", async () => {
    const user = setupUser();
    show();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(playFestiveChime).toHaveBeenCalledTimes(2);
  });
});

describe("the festive theme itself", () => {
  it("remembers the choice per device", async () => {
    const user = setupUser();
    show();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(localStorage.getItem("gsos-festive")).toBe("on");
  });

  it("puts its own class on the document, layered over light or dark", async () => {
    const user = setupUser();
    show();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(document.documentElement.classList.contains("festive")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(document.documentElement.classList.contains("festive")).toBe(false);
  });
});

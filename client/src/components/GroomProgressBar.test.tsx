import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroomProgressBar } from "./GroomProgressBar";
import { GROOMING_STEPS } from "@shared/groomingStage";
import { WORKFLOW_STAGE_COLOURS } from "@shared/workflowStageColours";

function statuses() {
  return Array.from(screen.getByTestId("groom-progress").querySelectorAll("li")).map((li) => ({
    step: li.getAttribute("data-step"),
    status: li.getAttribute("data-status"),
  }));
}

describe("GroomProgressBar", () => {
  it("draws Andy's six steps, in order", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    expect(statuses().map((s) => s.step)).toEqual([
      "checked_in", "bath", "dry", "groom", "ready", "collected",
    ]);
    // Both label variants are in the DOM; CSS picks one by width, which
    // jsdom does not apply. getAllByText, so this does not fail on the
    // steps whose short and full labels are the same string.
    for (const label of ["Checked in", "Bathing", "Drying", "Grooming", "Ready for pickup", "Picked up"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("carries a short label for a phone and the full one for a wider screen", () => {
    // At 375px a sixth of the width is ~50px, and "Ready for pickup"
    // wrapped to two ragged lines against neighbours that did not.
    render(<GroomProgressBar workflowState="ready" petName="Rosie" />);
    const ready = screen.getByTestId("groom-progress").querySelector('[data-step="ready"]')!;
    expect(ready.querySelector(".sm\\:hidden")?.textContent).toBe("Ready");
    expect(ready.querySelector(".hidden")?.textContent).toBe("Ready for pickup");
  });

  it("marks exactly one step current", () => {
    render(<GroomProgressBar workflowState="grooming" petName="Rosie" />);
    const current = statuses().filter((s) => s.status === "current");
    expect(current).toHaveLength(1);
    expect(current[0].step).toBe("groom");
  });

  it("shows a dog in the dryer queue on the Drying step, same as one under the dryer", () => {
    // Andy: the client doesn't need to see the delays between stages. So
    // these two must render identically.
    const { unmount } = render(<GroomProgressBar workflowState="waiting_for_dry" petName="Rosie" />);
    const queued = statuses();
    unmount();
    render(<GroomProgressBar workflowState="drying" petName="Rosie" />);
    expect(queued).toEqual(statuses());
    expect(queued.find((s) => s.status === "current")?.step).toBe("dry");
  });

  it("renders a groomer-queue dog identically to one being groomed", () => {
    const { unmount } = render(<GroomProgressBar workflowState="waiting_for_groom" petName="Rosie" />);
    const queued = statuses();
    unmount();
    render(<GroomProgressBar workflowState="grooming" petName="Rosie" />);
    expect(queued).toEqual(statuses());
  });

  it("ticks off only what is finished", () => {
    render(<GroomProgressBar workflowState="ready" petName="Rosie" />);
    expect(statuses()).toEqual([
      { step: "checked_in", status: "done" },
      { step: "bath", status: "done" },
      { step: "dry", status: "done" },
      { step: "groom", status: "done" },
      // Ready is current, not done: the client has not collected them.
      { step: "ready", status: "current" },
      { step: "collected", status: "upcoming" },
    ]);
  });

  it("marks all six done once the dog is collected", () => {
    render(<GroomProgressBar workflowState="complete" petName="Rosie" />);
    expect(statuses().every((s) => s.status === "done")).toBe(true);
  });

  it("draws nothing before the dog arrives", () => {
    // Six grey dots on the morning of a booking invite "why has nothing
    // started".
    render(<GroomProgressBar workflowState="scheduled" petName="Rosie" />);
    expect(screen.queryByTestId("groom-progress")).not.toBeInTheDocument();
  });

  it("draws nothing for a cancelled or missed appointment", () => {
    for (const state of ["cancelled", "no_show"]) {
      const { unmount } = render(<GroomProgressBar workflowState={state} petName="Rosie" />);
      expect(screen.queryByTestId("groom-progress"), state).not.toBeInTheDocument();
      unmount();
    }
  });

  it("names the dog for a screen reader", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    expect(screen.getByLabelText("Rosie's progress")).toBeInTheDocument();
  });

  it("marks the current step with aria-current", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    const marked = screen.getByTestId("groom-progress").querySelectorAll('[aria-current="step"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute("data-step")).toBe("bath");
  });

  it("shows no times or durations anywhere", () => {
    // The salon runs behind; a promised time that slips is worse than none.
    for (const state of ["checked_in", "waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready", "complete"]) {
      const { container, unmount } = render(<GroomProgressBar workflowState={state} petName="Rosie" />);
      expect(container.textContent, state).not.toMatch(/\d{1,2}[:.]\d{2}|minute|hour|\bam\b|\bpm\b/i);
      unmount();
    }
  });
});

describe("the colours match the staff board", () => {
  function barFor(step: string) {
    return screen.getByTestId("groom-progress").querySelector(`[data-step="${step}"] > div`) as HTMLElement;
  }

  it("gives each lit step its own stage colour, not one brand purple", () => {
    // Andy, 21/10/2026: "Make the different grooming stages more evident
    // and colourful. Possibly to match the workflow board colour scheme."
    render(<GroomProgressBar workflowState="ready" petName="Rosie" />);
    const lit = ["checked_in", "bath", "dry", "groom", "ready"].map((k) => barFor(k).style.backgroundColor);
    // Five distinct colours, not five copies of one.
    expect(new Set(lit).size).toBe(5);
  });

  it("uses the exact hexes the board uses", () => {
    render(<GroomProgressBar workflowState="ready" petName="Rosie" />);
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    expect(barFor("checked_in").style.backgroundColor).toBe(rgb(WORKFLOW_STAGE_COLOURS.checked_in));
    expect(barFor("bath").style.backgroundColor).toBe(rgb(WORKFLOW_STAGE_COLOURS.bathing));
    expect(barFor("dry").style.backgroundColor).toBe(rgb(WORKFLOW_STAGE_COLOURS.drying));
    expect(barFor("groom").style.backgroundColor).toBe(rgb(WORKFLOW_STAGE_COLOURS.grooming));
    expect(barFor("ready").style.backgroundColor).toBe(rgb(WORKFLOW_STAGE_COLOURS.ready));
  });

  it("leaves an upcoming step grey rather than a faded version of its colour", () => {
    // A washed-out amber reads as "this is happening, dimly".
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    expect(barFor("groom").style.backgroundColor).toBe("");
    expect(barFor("groom").className).toContain("bg-muted");
  });

  it("rings the current step so it reads as here, not merely coloured", () => {
    render(<GroomProgressBar workflowState="drying" petName="Rosie" />);
    expect(barFor("dry").className).toContain("ring-2");
    expect(barFor("bath").className).not.toContain("ring-2");
  });

  it("has a colour for every one of the six", () => {
    for (const step of GROOMING_STEPS) {
      expect(step.colour, step.key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("the Groomigo dog that walks the bar", () => {
  const dog = () => screen.getByTestId("groom-dog");

  /**
   * The browser normalises calc(), so asserting the literal string is
   * brittle. This reduces it to a comparable number by treating the
   * column width as one unit: px terms plus the coefficients of
   * (100% - 30px). What matters is the ordering, not the spelling.
   */
  function position(): number {
    const left = dog().style.left;
    const px = [...left.matchAll(/(-?[\d.]+)px/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n !== 30)        // the gap total inside (100% - 30px)
      .reduce((a, b) => a + b, 0);
    const coef = [...left.matchAll(/(-?[\d.]+)\s*\*\s*\(100% - 30px\)/g)]
      .reduce((a, m) => a + Number(m[1]), 0);
    return px + coef * 1000;          // scaled so the column term dominates
  }

  it("starts over the first step, not off the end of the bar", () => {
    render(<GroomProgressBar workflowState="checked_in" petName="Rosie" />);
    const p = position();
    expect(p).toBeGreaterThan(0);
    // Half a column in, so well inside the first sixth.
    expect(p).toBeLessThan(1000 / 6);
  });

  it("moves further along at each stage, and never back", () => {
    const seen: number[] = [];
    for (const state of ["checked_in", "bathing", "drying", "grooming", "ready", "complete"]) {
      const { unmount } = render(<GroomProgressBar workflowState={state} petName="Rosie" />);
      seen.push(position());
      unmount();
    }
    expect(seen).toHaveLength(6);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `step ${i} is not past step ${i - 1}`).toBeGreaterThan(seen[i - 1]);
    }
    // And it finishes inside the bar rather than past its right edge.
    expect(seen[5]).toBeLessThan(1000);
  });

  it("does not move for a delay the client is not shown", () => {
    // waiting_for_dry and drying are the same step, so the dog must not
    // twitch between them — that would leak the queue it exists to hide.
    const { unmount } = render(<GroomProgressBar workflowState="waiting_for_dry" petName="Rosie" />);
    const queued = position();
    unmount();
    render(<GroomProgressBar workflowState="drying" petName="Rosie" />);
    expect(position()).toBe(queued);
  });

  it("takes the colour of the step it is standing on", () => {
    const { unmount } = render(<GroomProgressBar workflowState="grooming" petName="Rosie" />);
    const amber = dog().style.color;
    unmount();
    render(<GroomProgressBar workflowState="ready" petName="Rosie" />);
    expect(dog().style.color).not.toBe(amber);
    expect(amber).not.toBe("");
  });

  it("is hidden from screen readers, so the step is not announced twice", () => {
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    expect(dog().getAttribute("aria-hidden")).toBe("true");
    expect(dog().closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("only animates when the viewer allows motion", () => {
    // A marker sliding across the screen is exactly what prefers-reduced-
    // motion is for. motion-safe: means it simply appears in place.
    render(<GroomProgressBar workflowState="bathing" petName="Rosie" />);
    const cls = dog().getAttribute("class") ?? "";
    expect(cls).toContain("motion-safe:transition-");
    expect(cls).not.toMatch(/(^|\s)transition-/);
  });

  it("is not drawn at all when there is no bar", () => {
    for (const state of ["scheduled", "cancelled", "no_show"]) {
      const { unmount } = render(<GroomProgressBar workflowState={state} petName="Rosie" />);
      expect(screen.queryByTestId("groom-dog"), state).not.toBeInTheDocument();
      unmount();
    }
  });
});

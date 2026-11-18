import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MoveTextQuestion } from "./MoveTextQuestion";

describe("MoveTextQuestion", () => {
  it("shows nothing until it is asked", () => {
    render(<MoveTextQuestion open={false} onAnswer={() => {}} />);
    expect(screen.queryByText("Text the client about the new day?")).toBeNull();
  });

  it("reports each of the three answers", () => {
    const onAnswer = vi.fn();
    render(<MoveTextQuestion open onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Move and text" }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Move, no text" }));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: /Don.t move it/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });
});

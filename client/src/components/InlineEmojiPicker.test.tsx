import { describe, it, expect, vi } from "vitest";
import { useRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEmojiPicker } from "./InlineEmojiPicker";

const setupUser = () => userEvent.setup({ delay: null });

/** The field plus its picker, wired the way PetCodeCatalogue wires them. */
function Harness({
  initial = "",
  recentFrom = [],
  onValue,
}: {
  initial?: string;
  recentFrom?: string[];
  onValue?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        aria-label="Code"
        value={value}
        onChange={(e) => { setValue(e.target.value); onValue?.(e.target.value); }}
      />
      <InlineEmojiPicker
        value={value}
        onChange={(v) => { setValue(v); onValue?.(v); }}
        inputRef={ref}
        recentFrom={recentFrom}
      />
    </div>
  );
}

describe("InlineEmojiPicker", () => {
  it("stays shut until the button is pressed", async () => {
    render(<Harness />);
    expect(screen.queryByTestId("emoji-panel")).not.toBeInTheDocument();
    await setupUser().click(screen.getByRole("button", { name: /insert an emoji/i }));
    expect(screen.getByTestId("emoji-panel")).toBeInTheDocument();
  });

  it("puts the chosen emoji into the field", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.click(screen.getByRole("button", { name: /💊/ }));
    expect(screen.getByLabelText("Code")).toHaveValue("💊");
  });

  /**
   * Their codes read "✂️5f" — emoji first. Appending would mean typing
   * the blade number, tapping the emoji, then dragging it to the front.
   */
  it("inserts at the cursor rather than appending", async () => {
    const user = setupUser();
    render(<Harness initial="5f" />);
    const field = screen.getByLabelText("Code") as HTMLInputElement;
    field.setSelectionRange(0, 0);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.click(screen.getByRole("button", { name: /✂️/ }));
    expect(field).toHaveValue("✂️5f");
  });

  /** "💥🚩" is a normal code; closing after one would make it two trips. */
  it("stays open after a pick, so a second one is one more tap", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.click(screen.getByRole("button", { name: /💥/ }));
    expect(screen.getByTestId("emoji-panel")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /🚩/ }));
    expect(screen.getByLabelText("Code")).toHaveValue("💥🚩");
  });

  it("closes on Done", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.queryByTestId("emoji-panel")).not.toBeInTheDocument();
  });

  it("searches by what the emoji means at the salon", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.type(screen.getByLabelText("Search emoji"), "deaf");
    const panel = within(screen.getByTestId("emoji-panel"));
    expect(panel.getByRole("button", { name: /🦻/ })).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /💊/ })).not.toBeInTheDocument();
  });

  it("says so plainly when nothing matches, rather than showing an empty box", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.type(screen.getByLabelText("Search emoji"), "quantum");
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  /**
   * The groups are Barkin' Beautiful's vocabulary. This row is every
   * other salon's — it is what makes the picker open on something
   * familiar for a salon whose codes are nothing like theirs.
   */
  it("offers the emoji this salon already uses, first", async () => {
    const user = setupUser();
    render(<Harness recentFrom={["🐙 octopus code", "🐙 again", "SENSITIVE"]} />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    const panel = screen.getByTestId("emoji-panel");
    expect(within(panel).getByText(/already used here/i)).toBeInTheDocument();
    // 🐙 is in no curated group, so finding it proves the row is live data.
    await user.click(within(panel).getByRole("button", { name: /🐙/ }));
    expect(screen.getByLabelText("Code")).toHaveValue("🐙");
  });

  it("shows no 'already used' heading for a salon with no emoji codes", async () => {
    const user = setupUser();
    render(<Harness recentFrom={["SENSITIVE", "#7f", "DOG AGGRESSIVE"]} />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    expect(screen.queryByText(/already used here/i)).not.toBeInTheDocument();
  });

  it("reports the new value to its owner, not just to the input", async () => {
    const onValue = vi.fn();
    const user = setupUser();
    render(<Harness onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: /insert an emoji/i }));
    await user.click(screen.getByRole("button", { name: /📢/ }));
    expect(onValue).toHaveBeenCalledWith("📢");
  });
});

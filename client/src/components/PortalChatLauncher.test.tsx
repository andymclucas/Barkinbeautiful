import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PortalChatLauncher } from "./PortalChatLauncher";

/**
 * A client looking for where to message the salon must be able to find it
 * by reading. It used to be Bruce's face alone, with no words, and a client
 * told the salon they could not see where to send a message (20/11/2026).
 */
describe("PortalChatLauncher", () => {
  it("says 'Message us' in words while the chat is closed", () => {
    render(<PortalChatLauncher open={false} unread={0} onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Message us" });
    expect(button).toHaveTextContent("Message us");
  });

  it("opens the chat when pressed", () => {
    const onToggle = vi.fn();
    render(<PortalChatLauncher open={false} unread={0} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Message us" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows how many replies are waiting, and says so to a screen reader", () => {
    render(<PortalChatLauncher open={false} unread={2} onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Message us, 2 unread" });
    expect(button).toHaveTextContent("2");
  });

  it("becomes a close button once the chat is open", () => {
    const onToggle = vi.fn();
    render(<PortalChatLauncher open={true} unread={3} onToggle={onToggle} />);
    expect(screen.queryByText("Message us")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    clientPortal: {
      getChat: { useQuery: () => ({ data: (globalThis as any).__chat }) },
    },
  },
}));

import { PortalMessagesCard } from "./PortalMessagesCard";

describe("PortalMessagesCard", () => {
  it("says what it is for and opens the chat", async () => {
    (globalThis as any).__chat = { messages: [], unread: 0 };
    const onOpen = vi.fn();
    render(<PortalMessagesCard onOpen={onOpen} />);
    expect(screen.getByRole("heading", { name: "Messages" })).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Message us" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("tells the client when the salon has replied", () => {
    (globalThis as any).__chat = { messages: [], unread: 2 };
    render(<PortalMessagesCard onOpen={() => {}} />);
    expect(screen.getByText("You have 2 new replies from us.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read your messages" })).toBeInTheDocument();
  });

  it("cannot be pressed on a staff preview", () => {
    (globalThis as any).__chat = undefined;
    render(<PortalMessagesCard readOnly onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "Message us" })).toBeDisabled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const thread = { id: 7, clientId: 1162, status: "open", firstName: "Andy", lastName: "McLucas" };

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: {
      portalChat: {
        listThreads: { useQuery: () => ({ data: [{ ...thread, unread: 0, preview: "Hello", lastMessageAt: null, readByName: null, staffLastReadAt: null }], isLoading: false, refetch: vi.fn() }) },
        getThread: { useQuery: (input: { threadId: number }) => ({ data: input.threadId ? { thread, messages: [] } : undefined, refetch: vi.fn() }) },
        markRead: { useMutation: mutation },
        reply: { useMutation: mutation },
      },
    },
  };
});
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import PortalInbox from "./PortalInbox";

describe("Portal messages", () => {
  it("links the client's name to their client card (Lauren and Andy, 24/11/2026)", () => {
    render(<PortalInbox />);
    fireEvent.click(screen.getByText("Andy McLucas"));
    expect(screen.getByTestId("portal-thread-client-link")).toHaveAttribute("href", "/clients/1162");
    expect(screen.getByRole("button", { name: /Open client card/ }).closest("a")).toHaveAttribute("href", "/clients/1162");
  });
});

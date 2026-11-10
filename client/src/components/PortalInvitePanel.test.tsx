import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PortalInvitePanelView, type PortalInvitePreview, type PortalInviteProgress } from "./PortalInvitePanel";

const preview = (over: Partial<PortalInvitePreview> = {}): PortalInvitePreview => ({
  count: 612, activeClients: 1033, sample: ["Jane Smith"], exampleSubject: "Set up your portal", exampleHtml: "<p>Hi</p>",
  skipped: [{ reason: "no_email", label: "No email address on file", count: 370 }], enabled: true, ...over,
});

function view(props: Partial<Parameters<typeof PortalInvitePanelView>[0]> = {}) {
  const onStart = vi.fn();
  render(<PortalInvitePanelView preview={preview()} progress={null} starting={false} resuming={false} onStart={onStart} onResume={vi.fn()} {...props} />);
  return { onStart };
}

describe("PortalInvitePanelView", () => {
  it("says how many will be emailed and why the rest will not", () => {
    view();
    expect(screen.getByTestId("invite-count")).toHaveTextContent("612");
    expect(screen.getByText(/370 — No email address on file/)).toBeInTheDocument();
  });

  it("will not send to hundreds of clients until the number is typed", () => {
    const { onStart } = view();
    const send = screen.getByRole("button", { name: /Send invitations to 612/ });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type 612 to confirm/), { target: { value: "61" } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type 612 to confirm/), { target: { value: "612" } });
    fireEvent.click(send);
    expect(onStart).toHaveBeenCalledWith(612);
  });

  it("offers no send button where bulk sending is off", () => {
    view({ preview: preview({ enabled: false }) });
    expect(screen.queryByRole("button", { name: /Send invitations/ })).toBeNull();
    expect(screen.getByText(/switched off/)).toBeInTheDocument();
  });

  it("hides the send while one is already going, and offers resume when it stalled", () => {
    const progress: PortalInviteProgress = { id: 1, status: "sending", totalRecipients: 612, sent: 200, failed: 2, pending: 410, running: false, failures: [] };
    view({ progress });
    expect(screen.queryByRole("button", { name: /Send invitations/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Resume sending/ })).toBeInTheDocument();
    expect(screen.getByText(/200 sent, 2 not sent, 410 waiting of 612/)).toBeInTheDocument();
  });
});

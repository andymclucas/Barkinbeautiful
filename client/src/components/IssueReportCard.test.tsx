import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IssueReportCard, type IssueReportView } from "./IssueReportCard";

const report = (over: Partial<IssueReportView> = {}): IssueReportView => ({
  id: 7,
  reporterName: "Lauren Romari",
  message: "Pressed Send and nothing happened",
  pagePath: "/clients/1162",
  context: { clientId: 1162, search: "?tab=notes", viewport: "1440x900" },
  clientName: "Andy McLucas",
  petName: null,
  recentErrors: [{ kind: "trpc_mutation_error", message: "sms.send (400): No mobile number", at: "2026-11-11T03:00:00.000Z" }],
  images: [{ key: "issue-reports/1.jpg", kind: "screenshot", url: "/api/issue-report-image?key=issue-reports%2F1.jpg" }],
  status: "new",
  resolutionNote: null,
  createdAt: "2026-11-11T03:01:00.000Z",
  ...over,
});

describe("IssueReportCard", () => {
  it("shows who, what, where, the client by name and the page's errors", () => {
    render(<IssueReportCard report={report()} timeZone="Australia/Brisbane" onSetStatus={() => {}} />);
    expect(screen.getByText("Lauren Romari")).toBeInTheDocument();
    expect(screen.getByText("Pressed Send and nothing happened")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Client: Andy McLucas/ })).toHaveAttribute("href", "/clients/1162");
    expect(screen.getByRole("link", { name: /On \/clients\/1162/ })).toHaveAttribute("href", "/clients/1162?tab=notes");
    expect(screen.getByText("1 error on the page just before")).toBeInTheDocument();
    expect(screen.getByText(/No mobile number/)).toBeInTheDocument();
    expect(screen.getByAltText("Screenshot of the screen")).toBeInTheDocument();
    // 1:01 pm Brisbane, whatever zone the test machine is in.
    expect(screen.getByText(/1:01/)).toBeInTheDocument();
  });

  it("moves a new report on, and asks for a note before marking it fixed", () => {
    const onSetStatus = vi.fn();
    render(<IssueReportCard report={report()} timeZone="Australia/Brisbane" onSetStatus={onSetStatus} />);
    fireEvent.click(screen.getByRole("button", { name: "Working on it" }));
    expect(onSetStatus).toHaveBeenLastCalledWith("in_progress");

    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
    fireEvent.change(screen.getByPlaceholderText("What was done (optional)"), { target: { value: "Shipped in a3a3752" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
    expect(onSetStatus).toHaveBeenLastCalledWith("fixed", "Shipped in a3a3752");
  });

  it("offers only Reopen once it is done", () => {
    render(<IssueReportCard report={report({ status: "fixed", resolutionNote: "Done" })} timeZone="Australia/Brisbane" onSetStatus={() => {}} />);
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark fixed" })).toBeNull();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});

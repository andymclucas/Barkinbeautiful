import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageNumbers } from "./PageNumbers";

describe("PageNumbers", () => {
  it("offers every page of a four-page list and marks the current one", () => {
    render(<PageNumbers page={2} totalPages={4} onPage={() => {}} label="Membership pages" />);
    for (const n of [1, 2, 3, 4]) expect(screen.getByRole("button", { name: `Page ${n}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  });

  it("jumps straight to the page pressed", async () => {
    const onPage = vi.fn();
    render(<PageNumbers page={1} totalPages={4} onPage={onPage} label="Membership pages" />);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Page 4" }));
    expect(onPage).toHaveBeenCalledWith(4);
  });

  it("stops at the ends", () => {
    render(<PageNumbers page={1} totalPages={4} onPage={() => {}} label="Membership pages" />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("draws nothing for a single page", () => {
    const { container } = render(<PageNumbers page={1} totalPages={1} onPage={() => {}} label="Membership pages" />);
    expect(container).toBeEmptyDOMElement();
  });
});

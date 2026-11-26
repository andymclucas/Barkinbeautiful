import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExistingClientPortalLink } from "./ExistingClientPortalLink";

describe("ExistingClientPortalLink", () => {
  it("sends an existing client to the portal sign-in", () => {
    render(<ExistingClientPortalLink salonName="Barkin' Beautiful" />);
    expect(screen.getByRole("link", { name: /sign in to your portal/i })).toHaveAttribute("href", "/portal/login");
    expect(screen.getByText(/Ask Barkin' Beautiful to send your portal invite/)).toBeInTheDocument();
  });

  it("reads sensibly without a salon name", () => {
    render(<ExistingClientPortalLink />);
    expect(screen.getByText(/Ask the salon to send your portal invite/)).toBeInTheDocument();
  });
});

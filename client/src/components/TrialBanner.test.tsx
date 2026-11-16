import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrialBannerView } from "./TrialBanner";

describe("TrialBannerView", () => {
  it("sends an expired salon straight to the Billing tab", () => {
    // /settings alone opens on Salon, where an expired salon sees a page
    // of refused requests and no way to pay.
    render(<TrialBannerView ended daysLeft={0} trialDays={7} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your trial has ended.");
    expect(screen.getByRole("link", { name: "Choose a plan" })).toHaveAttribute("href", "/settings?tab=billing");
  });

  it("sends a salon still on its trial to the same place", () => {
    render(<TrialBannerView ended={false} daysLeft={2} trialDays={7} />);
    expect(screen.getByText("2 days left in your trial")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a plan" })).toHaveAttribute("href", "/settings?tab=billing");
  });
});

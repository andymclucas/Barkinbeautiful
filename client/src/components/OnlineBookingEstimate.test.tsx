import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnlineBookingEstimate } from "./OnlineBookingEstimate";
import { ESTIMATE_DISCLAIMER } from "@shared/onlineBookingPrice";

describe("OnlineBookingEstimate", () => {
  it("shows the figure and its disclaimer together", () => {
    render(<OnlineBookingEstimate price="95.00" disclaimer={ESTIMATE_DISCLAIMER} />);
    expect(screen.getByText("$95.00")).toBeInTheDocument();
    expect(screen.getByText(ESTIMATE_DISCLAIMER)).toBeInTheDocument();
  });

  it("never renders a price with no disclaimer in view", () => {
    // The requirement in one assertion: wherever the number appears, the
    // caveat appears with it. Not a tooltip, not a hover.
    const { container } = render(<OnlineBookingEstimate price="95.00" disclaimer={ESTIMATE_DISCLAIMER} />);
    const text = container.textContent ?? "";
    expect(text).toContain("$95.00");
    expect(text).toContain(ESTIMATE_DISCLAIMER);
    // And the caveat actually says the price can move, in those words.
    expect(text).toMatch(/can change on the day/);
  });

  it("says we will confirm the price when there is no figure", () => {
    render(<OnlineBookingEstimate price={null} disclaimer={null} />);
    expect(screen.getByTestId("estimate-unknown")).toBeInTheDocument();
    expect(screen.queryByTestId("estimate")).not.toBeInTheDocument();
  });

  it("treats a zero price as no price, not a free groom", () => {
    for (const nothing of ["0", "0.00", ""]) {
      const { unmount } = render(<OnlineBookingEstimate price={nothing} disclaimer={ESTIMATE_DISCLAIMER} />);
      expect(screen.getByTestId("estimate-unknown")).toBeInTheDocument();
      expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows a loading line rather than a stale or empty price", () => {
    render(<OnlineBookingEstimate price={null} disclaimer={null} loading />);
    expect(screen.getByTestId("estimate-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("estimate-unknown")).not.toBeInTheDocument();
  });

  it("renders the figure even if the server sent no disclaimer", () => {
    // Degrades to the number rather than hiding a real price, but this
    // path should not happen: the server returns both or neither.
    render(<OnlineBookingEstimate price="120.00" disclaimer={null} />);
    expect(screen.getByText("$120.00")).toBeInTheDocument();
  });
});

describe("a price range", () => {
  it("shows the span, not the cheapest end of it", () => {
    // The de-shed case: $120 (1hr) to $330 (3hr). Quoting $120 to the
    // owner of a 45kg long-haired dog is out by $210.
    render(<OnlineBookingEstimate
      price={null}
      range={{ low: "120.00", high: "330.00" }}
      reason="This groom is priced on the day, once we've seen your dog's coat."
      disclaimer={ESTIMATE_DISCLAIMER}
    />);
    expect(screen.getByTestId("estimate-range")).toBeInTheDocument();
    expect(screen.getByText("$120.00 – $330.00")).toBeInTheDocument();
  });

  it("carries a caveat, because a range is still a statement about money", () => {
    const { container } = render(<OnlineBookingEstimate
      price={null}
      range={{ low: "120.00", high: "330.00" }}
      reason="This groom is priced on the day, once we've seen your dog's coat."
      disclaimer={ESTIMATE_DISCLAIMER}
    />);
    expect(container.textContent).toContain("priced on the day");
  });

  it("collapses a range whose ends are equal to the plain no-price line", () => {
    render(<OnlineBookingEstimate price={null} range={{ low: "95.00", high: "95.00" }} disclaimer={null} />);
    expect(screen.queryByTestId("estimate-range")).not.toBeInTheDocument();
    expect(screen.getByTestId("estimate-unknown")).toBeInTheDocument();
  });

  it("prefers a single figure over a range when both arrive", () => {
    render(<OnlineBookingEstimate price="145.00" range={{ low: "120.00", high: "330.00" }} disclaimer={ESTIMATE_DISCLAIMER} />);
    expect(screen.getByTestId("estimate")).toBeInTheDocument();
    expect(screen.getByText("$145.00")).toBeInTheDocument();
    expect(screen.queryByTestId("estimate-range")).not.toBeInTheDocument();
  });
});

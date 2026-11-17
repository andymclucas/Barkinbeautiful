import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VersusPrevious } from "./VersusPrevious";

const dollars = (n: number) => `$${n.toFixed(2)}`;

describe("VersusPrevious", () => {
  it("says how far up, against which period, and what the earlier figure was", () => {
    render(<VersusPrevious current={110} previous={100} name="previous year" format={dollars} />);
    expect(screen.getByText(/10%/)).toBeInTheDocument();
    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText(/vs previous year \(\$100\.00\)/)).toBeInTheDocument();
  });

  it("says down when it is down", () => {
    render(<VersusPrevious current={75} previous={100} name="previous week" format={dollars} />);
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
  });

  it("gives no percentage when the earlier period had nothing", () => {
    render(<VersusPrevious current={500} previous={0} name="previous month" format={dollars} />);
    expect(screen.getByText(/nothing to compare/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("shows it is still working rather than a zero", () => {
    render(<VersusPrevious current={500} previous={undefined} name="previous month" format={dollars} />);
    expect(screen.getByText(/vs previous month: …/)).toBeInTheDocument();
  });
});

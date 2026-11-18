import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RetailProductPicker } from "./RetailProductPicker";

const PRODUCTS = [
  { id: 1, name: "Oatmeal Shampoo 500ml", sku: "SH-OAT-500", category: "Shampoo", priceAud: "24.00", stockQty: 9 },
  { id: 2, name: "Chicken Treats", sku: null, category: "Treats", priceAud: "12.50", stockQty: 2 },
  { id: 3, name: "Slip Lead", sku: "LD-01", category: null, priceAud: "15.00", stockQty: 0 },
];

function open(onChange = vi.fn(), value = "") {
  render(<RetailProductPicker products={PRODUCTS} value={value} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  return onChange;
}

describe("RetailProductPicker", () => {
  it("is closed until pressed, then lists every product with a search box", () => {
    render(<RetailProductPicker products={PRODUCTS} value="" onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Search products")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Add a product…"));
    expect(screen.getByLabelText("Search products")).toBeInTheDocument();
    expect(screen.getByText("Oatmeal Shampoo 500ml")).toBeInTheDocument();
    expect(screen.getByText("Slip Lead")).toBeInTheDocument();
  });

  it("narrows the list as somebody types, and picks the one they press", () => {
    const onChange = open();
    fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "treat" } });
    expect(screen.queryByText("Oatmeal Shampoo 500ml")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Chicken Treats"));
    expect(onChange).toHaveBeenCalledWith("2");
    // Picking closes the list.
    expect(screen.queryByLabelText("Search products")).not.toBeInTheDocument();
  });

  it("takes the only match on Enter", () => {
    const onChange = open();
    const box = screen.getByLabelText("Search products");
    fireEvent.change(box, { target: { value: "ld-01" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("does not guess on Enter when several match", () => {
    const onChange = open();
    fireEvent.keyDown(screen.getByLabelText("Search products"), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says so when nothing matches", () => {
    open();
    fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "cat food" } });
    expect(screen.getByText("No product matches “cat food”.")).toBeInTheDocument();
  });

  it("keeps the price and the low-stock hint on each row", () => {
    open();
    expect(screen.getByText("$12.50 · 2 left")).toBeInTheDocument();
    expect(screen.getByText("$15.00 · none left")).toBeInTheDocument();
    expect(screen.getByText("$24.00")).toBeInTheDocument();
  });

  it("shows the chosen product and its price on the button", () => {
    render(<RetailProductPicker products={PRODUCTS} value="1" onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("Oatmeal Shampoo 500ml · $24.00");
  });
});

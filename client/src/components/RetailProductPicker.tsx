import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchRetailProducts } from "@shared/retailProductSearch";

export type PickableRetailProduct = {
  id: number;
  name: string;
  sku?: string | null;
  category?: string | null;
  priceAud?: string | null;
  stockQty?: number | string | null;
};

/**
 * Choosing a product to sell, with a search box.
 *
 * The two places retail is sold were plain dropdowns, so finding one
 * product meant scrolling the whole catalogue (fix desk 0005).
 *
 * The list opens IN the page, under the button, rather than in a
 * floating popover. One of the two callers sits inside the Calendar's
 * edit dialog, where a floating list is outside the dialog's scroll
 * lock and will not scroll (see the note in ui/popover.tsx). In the
 * flow it scrolls and takes focus like any other part of the form.
 */
export function RetailProductPicker({ products, value, onChange, className, triggerClassName }: {
  products: readonly PickableRetailProduct[];
  /** The chosen product's id as a string, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = products.find((p) => String(p.id) === value);
  const matches = matchRetailProducts(products, query);

  const pick = (id: number) => {
    onChange(String(id));
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !chosen && "text-muted-foreground")}>
          {chosen ? `${chosen.name} · $${chosen.priceAud ?? "0.00"}` : "Add a product…"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="mt-1 rounded-md border bg-popover text-popover-foreground shadow-sm">
          <div className="flex items-center gap-2 border-b px-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="Search products"
              placeholder="Search products…"
              className="h-10 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter takes the only match, so a scanned or typed
                // name does not also need a tap.
                if (e.key === "Enter" && matches.length === 1) {
                  e.preventDefault();
                  pick(matches[0].id);
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {products.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">Nothing in the Retail catalogue yet.</div>
            ) : matches.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No product matches “{query.trim()}”.</div>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    String(p.id) === value && "bg-accent/60",
                  )}
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    ${p.priceAud ?? "0.00"}
                    {/* Shown, never enforced: the count is what was last typed in, not the shelf. */}
                    {Number(p.stockQty) <= 0
                      ? " · none left"
                      : Number(p.stockQty) <= 3 ? ` · ${p.stockQty} left` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

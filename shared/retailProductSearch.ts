/**
 * Finding a product to sell by typing part of it.
 *
 * Lauren, 12/11/2026: "a search area on the invoice for retail because
 * you can't type in you just need to scroll to find the right retail
 * product. But in the setting, I can search."
 *
 * Every word typed must appear somewhere in the name, the SKU or the
 * category, in any order and any case, so "shampoo oat" finds
 * "Oatmeal Shampoo 500ml". An empty search returns everything, in the
 * order it was given.
 */
export type SearchableRetailProduct = {
  name: string;
  sku?: string | null;
  category?: string | null;
};

export function matchRetailProducts<T extends SearchableRetailProduct>(
  products: readonly T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...products];
  return products.filter((product) => {
    const haystack = `${product.name} ${product.sku ?? ""} ${product.category ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

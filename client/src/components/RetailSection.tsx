import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageOff, ImagePlus, Loader2, Package, Plus, Search } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * The shelf: what the salon sells over the counter.
 *
 * Andy, 05/11/2026: "Do a migration for retail from MoeGo to Groomigo -
 * create another section under pricing and services for 'retail'...
 * Full customisation for the products needs to be built in - with
 * images able to be added/deleted/edited."
 *
 * 71 products came across from MoeGo carrying a name, a price and a
 * stock figure, and nothing else — no SKU, no category, no supplier on
 * any of them. Everything beyond those three is empty until somebody
 * fills it in here, which is why this screen leads with the three that
 * have data and keeps the rest in the editor.
 */

type Product = {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  priceAud: string;
  costAud: string | null;
  stockQty: number;
  reorderThreshold: number;
  imageUrl: string | null;
  isActive: boolean;
};

const money = (value: string | null) =>
  value == null ? "—" : `$${Number(value).toFixed(2)}`;

/**
 * 31 of the 71 arrived negative, so this is the normal case and not an
 * edge one. Negative is its own state rather than lumped in with low:
 * "we have minus 47 ice creams" is a counting error to fix, and "we
 * have 2 left" is a reorder.
 */
function stockTone(product: Product): { label: string; className: string } {
  if (product.stockQty < 0) {
    return { label: `${product.stockQty} — needs counting`, className: "bg-destructive/10 text-destructive border-destructive/30" };
  }
  if (product.stockQty === 0) {
    return { label: "Out of stock", className: "bg-muted text-muted-foreground" };
  }
  if (product.stockQty <= product.reorderThreshold) {
    return { label: `${product.stockQty} left`, className: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900/50" };
  }
  return { label: `${product.stockQty} in stock`, className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50" };
}

export function RetailSection() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.retail.list.useQuery({
    search: search.trim() || undefined,
    includeArchived: showArchived,
  });
  const products = (data ?? []) as Product[];

  const refresh = () => utils.retail.list.invalidate();

  const setStock = trpc.retail.setStock.useMutation({
    onSuccess: () => { toast.success("Stock updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const setActive = trpc.retail.setActive.useMutation({
    onSuccess: (_r, v) => { toast.success(v.isActive ? "Back on the shelf" : "Archived"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  const needCounting = products.filter((p) => p.stockQty < 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            className="h-9 pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived products" />
          Show archived
        </label>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New product
        </Button>
      </div>

      {/* The number Andy will want first: how much of the shelf is
          lying to him. Hidden when it is zero, which is the state the
          salon is working towards. */}
      {needCounting > 0 && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {needCounting} product{needCounting === 1 ? "" : "s"} showing negative stock. These came
          across from MoeGo as they stood — count them and set the real figure.
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading the shelf…</p>}
      {!isLoading && products.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {search ? "Nothing matches that." : "No products yet."}
        </p>
      )}

      <div className="grid gap-2">
        {products.map((product) => {
          const tone = stockTone(product);
          return (
            <div
              key={product.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${product.isActive ? "" : "opacity-60"}`}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {product.name}
                  {!product.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">archived</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {money(product.priceAud)}
                  {product.category ? ` · ${product.category}` : ""}
                  {product.sku ? ` · ${product.sku}` : ""}
                </p>
              </div>

              <Badge variant="outline" className={`shrink-0 ${tone.className}`}>{tone.label}</Badge>

              {/* Counted, not nudged: somebody holding the box has a
                  number, and making them work out a delta from a screen
                  showing -4 is how one error becomes two. */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Label htmlFor={`stock-${product.id}`} className="sr-only">Counted stock for {product.name}</Label>
                <Input
                  id={`stock-${product.id}`}
                  type="number"
                  defaultValue={product.stockQty}
                  className="h-8 w-20"
                  onBlur={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next) || next === product.stockQty) return;
                    setStock.mutate({ id: product.id, stockQty: next });
                  }}
                />
                <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(product)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => setActive.mutate({ id: product.id, isActive: !product.isActive })}
                >
                  {product.isActive ? "Archive" : "Restore"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ProductDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        product={editing}
        open={editing !== null || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => { setEditing(null); setCreating(false); refresh(); }}
      />
    </div>
  );
}

/** Add or edit — the same fields either way, so the same dialog. */
function ProductDialog({
  product, open, onClose, onSaved,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    priceAud: product?.priceAud ?? "",
    costAud: product?.costAud ?? "",
    reorderThreshold: String(product?.reorderThreshold ?? 5),
    imageUrl: product?.imageUrl ?? "",
    stockQty: String(product?.stockQty ?? 0),
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const create = trpc.retail.create.useMutation({
    onSuccess: () => { toast.success("Product added"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.retail.update.useMutation({
    onSuccess: () => { toast.success("Product updated"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Photo must be 10 MB or smaller"); return; }
    setUploading(true);
    try {
      const response = await fetch("/api/upload/retail-product-photo", {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Upload failed");
      set({ imageUrl: payload.url });
      toast.success("Photo added — save to keep it");
    } catch (error: any) {
      toast.error(error.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const priceLooksWrong = form.priceAud !== "" && !Number.isFinite(Number(form.priceAud));
  const canSave = form.name.trim() !== "" && form.priceAud !== "" && !priceLooksWrong;

  const save = () => {
    const common = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      priceAud: Number(form.priceAud).toFixed(2),
      costAud: form.costAud.trim() ? Number(form.costAud).toFixed(2) : null,
      reorderThreshold: Number(form.reorderThreshold) || 0,
      imageUrl: form.imageUrl.trim() || null,
    };
    if (product) update.mutate({ id: product.id, ...common });
    else create.mutate({
      name: common.name,
      sku: common.sku ?? undefined,
      description: common.description ?? undefined,
      category: common.category ?? undefined,
      priceAud: common.priceAud,
      costAud: common.costAud ?? undefined,
      stockQty: Number(form.stockQty) || 0,
      reorderThreshold: common.reorderThreshold,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? product.name : "New product"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-md border object-cover" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-muted">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }}
              />
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
                {form.imageUrl ? "Replace photo" : "Add photo"}
              </Button>
              {form.imageUrl && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => set({ imageUrl: "" })}>
                  <ImageOff className="mr-1.5 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="rp-name">Name</Label>
            <Input id="rp-name" className="mt-1" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rp-price">Price</Label>
              <Input id="rp-price" className="mt-1" inputMode="decimal" value={form.priceAud}
                onChange={(e) => set({ priceAud: e.target.value })} placeholder="29.95" />
              {priceLooksWrong && <p className="mt-1 text-xs text-destructive">That is not a number.</p>}
            </div>
            <div>
              {/* What it costs the salon, which MoeGo never carried. It
                  is what turns the shelf into a margin rather than a
                  list, so it is offered even though every row is empty. */}
              <Label htmlFor="rp-cost">Cost to us <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input id="rp-cost" className="mt-1" inputMode="decimal" value={form.costAud}
                onChange={(e) => set({ costAud: e.target.value })} placeholder="14.00" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rp-category">Category</Label>
              <Input id="rp-category" className="mt-1" value={form.category}
                onChange={(e) => set({ category: e.target.value })} placeholder="Treats" />
            </div>
            <div>
              <Label htmlFor="rp-sku">SKU</Label>
              <Input id="rp-sku" className="mt-1" value={form.sku}
                onChange={(e) => set({ sku: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rp-reorder">Tell me when stock reaches</Label>
              <Input id="rp-reorder" className="mt-1" type="number" value={form.reorderThreshold}
                onChange={(e) => set({ reorderThreshold: e.target.value })} />
            </div>
            {!product && (
              <div>
                <Label htmlFor="rp-stock">Stock on hand</Label>
                <Input id="rp-stock" className="mt-1" type="number" value={form.stockQty}
                  onChange={(e) => set({ stockQty: e.target.value })} />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="rp-desc">Description</Label>
            <Textarea id="rp-desc" className="mt-1" rows={2} value={form.description}
              onChange={(e) => set({ description: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave || create.isPending || update.isPending} onClick={save}>
            {(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {product ? "Save changes" : "Add product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

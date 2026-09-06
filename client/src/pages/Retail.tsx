import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Package, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Retail() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", description: "", category: "", priceAud: "", costAud: "", stockQty: "0", reorderThreshold: "5" });

  const { data: products, refetch } = trpc.retail.list.useQuery({ tenantId: 1, search: search || undefined });
  const createMutation = trpc.retail.create.useMutation({
    onSuccess: () => { toast.success("Product added"); setShowAdd(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const lowStock = products?.filter(p => p.stockQty <= p.reorderThreshold) ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Retail Products</h1>
            <p className="text-sm text-muted-foreground">{products?.length ?? 0} products · {lowStock.length} low stock</p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Product</Button>
        </div>

        {lowStock.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Low Stock Alert</p>
              <p className="text-xs text-amber-700 mt-0.5">{lowStock.map(p => p.name).join(", ")} need reordering.</p>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="bg-card rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Category</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Price</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {!products?.length && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No products found.</td></tr>
              )}
              {products?.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{p.category ?? "—"}</td>
                  <td className="p-3 text-right font-medium">${p.priceAud}</td>
                  <td className="p-3 text-right">
                    <span className={p.stockQty <= p.reorderThreshold ? "text-amber-600 font-semibold" : "font-medium"}>{p.stockQty}</span>
                  </td>
                  <td className="p-3 hidden lg:table-cell">
                    {p.stockQty <= p.reorderThreshold ? (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">Low Stock</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 text-xs">In Stock</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5"><Label>Product Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Price (AUD) *</Label><Input type="number" step="0.01" value={form.priceAud} onChange={e => setForm(p => ({ ...p, priceAud: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Cost (AUD)</Label><Input type="number" step="0.01" value={form.costAud} onChange={e => setForm(p => ({ ...p, costAud: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Stock Qty</Label><Input type="number" value={form.stockQty} onChange={e => setForm(p => ({ ...p, stockQty: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Reorder At</Label><Input type="number" value={form.reorderThreshold} onChange={e => setForm(p => ({ ...p, reorderThreshold: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ tenantId: 1, ...form, stockQty: parseInt(form.stockQty), reorderThreshold: parseInt(form.reorderThreshold) })} disabled={createMutation.isPending || !form.name || !form.priceAud}>
              {createMutation.isPending ? "Adding..." : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

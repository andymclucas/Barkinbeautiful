import { useState } from "react";
import { toast } from "sonner";
import { PackageOpen, ShieldAlert, Syringe } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTimezone } from "@/lib/timezone";

/** Prepaid blocks of grooms: what is left, and selling another. */
export function ClientPackagesPanel({ clientId }: { clientId: number }) {
  const tz = useTimezone();
  const utils = trpc.useUtils();
  const { data: owned } = trpc.packages.forClient.useQuery({ tenantId: 1, clientId });
  const { data: catalogue } = trpc.packages.catalogue.useQuery({ tenantId: 1 });
  const [chosen, setChosen] = useState<string>("");

  const purchase = trpc.packages.purchase.useMutation({
    onSuccess: () => {
      toast.success("Package added");
      setChosen("");
      utils.packages.forClient.invalidate({ tenantId: 1, clientId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Packages</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {owned?.map(pkg => {
          // Expiry is worked out on read, so a package that lapsed last
          // night reads as expired this morning without anything running.
          const spent = pkg.creditsLeft <= 0;
          const dead = pkg.expired || spent || pkg.status === "cancelled";
          return (
            <div key={pkg.id} className={`rounded-lg border p-3 ${dead ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PackageOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{pkg.packageName}</span>
                </div>
                <Badge variant={dead ? "outline" : "secondary"}>
                  {pkg.status === "cancelled" ? "Cancelled"
                    : spent ? "All used"
                    : pkg.expired ? "Expired"
                    : `${pkg.creditsLeft} of ${pkg.creditsTotal} left`}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                ${Number(pkg.pricePaid).toFixed(2)} · bought {tz.date(pkg.purchasedAt)}
                {pkg.expiresAt ? ` · ${pkg.expired ? "expired" : "expires"} ${tz.date(pkg.expiresAt)}` : " · no expiry"}
              </p>
            </div>
          );
        })}
        {!owned?.length && <p className="text-sm text-muted-foreground">This client has no packages.</p>}

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="grid min-w-[14rem] flex-1 gap-1.5">
            <Label className="text-xs text-muted-foreground">Sell a package</Label>
            <Select value={chosen} onValueChange={setChosen}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose one" /></SelectTrigger>
              <SelectContent>
                {(catalogue ?? []).map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} — {item.credits} for ${Number(item.price).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!chosen || purchase.isPending}
            onClick={() => purchase.mutate({ tenantId: 1, clientId, packageId: Number(chosen) })}
          >
            {purchase.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
        {!catalogue?.length && (
          <p className="text-xs text-muted-foreground">No packages are set up to sell yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

const KINDS = ["C5", "Kennel cough", "Customer form", "Other"];

/**
 * Vaccinations and the signed customer form, per dog.
 *
 * Expiry is compared as "YYYY-MM-DD" strings end to end — a Date would be
 * midnight in whatever zone the browser is in, and a certificate would
 * read as expired a day early for anyone west of the salon.
 */
export function PetPaperworkPanel({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.petPaperwork.forClient.useQuery({ tenantId: 1, clientId });
  const [adding, setAdding] = useState<number | null>(null);
  const [kind, setKind] = useState(KINDS[0]);
  const [expiresOn, setExpiresOn] = useState("");

  const refresh = () => utils.petPaperwork.forClient.invalidate({ tenantId: 1, clientId });
  const save = trpc.petPaperwork.save.useMutation({
    onSuccess: () => { setAdding(null); setExpiresOn(""); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.petPaperwork.remove.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Vaccinations &amp; forms</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data?.map(pet => (
          <div key={pet.petId} className="space-y-2">
            <p className="text-sm font-medium">{pet.petName}</p>
            {pet.records.map(record => (
              <div key={record.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <Syringe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm">{record.kind}</span>
                {record.expiresOn ? (
                  <Badge variant={record.expired ? "destructive" : "secondary"} className="gap-1">
                    {record.expired && <ShieldAlert className="h-3 w-3" />}
                    {record.expired ? "Expired" : "Expires"} {record.expiresOn}
                  </Badge>
                ) : (
                  <Badge variant="outline">No expiry recorded</Badge>
                )}
                <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" title="Delete this record"
                  onClick={() => remove.mutate({ tenantId: 1, id: record.id })}>
                  <span aria-hidden="true" className="text-muted-foreground">&times;</span>
                  <span className="sr-only">Delete record</span>
                </Button>
              </div>
            ))}
            {!pet.records.length && <p className="text-xs text-muted-foreground">Nothing on file.</p>}

            {adding === pet.petId ? (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2.5">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Expires</Label>
                  <Input type="date" className="h-9 w-[9.5rem]" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
                </div>
                <Button size="sm" disabled={save.isPending}
                  onClick={() => save.mutate({ tenantId: 1, petId: pet.petId, kind, expiresOn: expiresOn || undefined })}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAdding(pet.petId)}>Add a record</Button>
            )}
          </div>
        ))}
        {!data?.length && <p className="text-sm text-muted-foreground">This client has no pets on file.</p>}
      </CardContent>
    </Card>
  );
}

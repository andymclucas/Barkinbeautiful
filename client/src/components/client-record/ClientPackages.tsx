import { useState } from "react";
import { toast } from "sonner";
import { PackageOpen, ShieldAlert, Syringe } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateField";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTimezone } from "@/lib/timezone";
import { prepaidBlockLabel, prepaidBlockUsable } from "@shared/prepaidGrooms";
import { serviceLabel } from "@shared/serviceTypes";

/** Prepaid blocks of grooms: what is left, and selling another. */
export function ClientPackagesPanel({ clientId }: { clientId: number }) {
  const tz = useTimezone();
  const utils = trpc.useUtils();
  const { data: owned } = trpc.packages.forClient.useQuery({ clientId });
  const { data: catalogue } = trpc.packages.catalogue.useQuery({});
  const [chosen, setChosen] = useState<string>("");

  const purchase = trpc.packages.purchase.useMutation({
    onSuccess: () => {
      toast.success("Package added");
      setChosen("");
      utils.packages.forClient.invalidate({ clientId });
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
          const dead = !prepaidBlockUsable(pkg);
          return (
            <div key={pkg.id} className={`rounded-lg border p-3 ${dead ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PackageOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{pkg.packageName}</span>
                </div>
                <Badge variant={dead ? "outline" : "secondary"}>{prepaidBlockLabel(pkg)}</Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                ${Number(pkg.pricePaid).toFixed(2)} · paid {tz.date(pkg.purchasedAt)}
                {pkg.expiresAt ? ` · ${pkg.expired ? "expired" : "expires"} ${tz.date(pkg.expiresAt)}` : " · no expiry"}
              </p>
              <PrepaidGrooms clientId={clientId} clientPackageId={pkg.id} usable={!dead} />
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
            onClick={() => purchase.mutate({ clientId, packageId: Number(chosen) })}
          >
            {purchase.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
        {!catalogue?.length && (
          <p className="text-xs text-muted-foreground">No packages are set up to sell yet.</p>
        )}
        <AddPrepaidBlock clientId={clientId} />
      </CardContent>
    </Card>
  );
}

/**
 * The grooms on one prepaid block: which bookings have been counted off
 * it, and a button to count the next one (shared/prepaidGrooms.ts).
 */
function PrepaidGrooms({ clientId, clientPackageId, usable }: { clientId: number; clientPackageId: number; usable: boolean }) {
  const tz = useTimezone();
  const utils = trpc.useUtils();
  const { data } = trpc.packages.grooms.useQuery({ clientPackageId });
  const refresh = () => {
    utils.packages.grooms.invalidate({ clientPackageId });
    utils.packages.forClient.invalidate({ clientId });
  };
  const count = trpc.packages.redeem.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const undo = trpc.packages.unredeem.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  if (!data) return null;
  const busy = count.isPending || undo.isPending;
  const line = (a: { petName: string | null; scheduledStart: Date | string; serviceType: string }) =>
    `${a.petName ?? "Dog"}, ${tz.date(a.scheduledStart)} · ${serviceLabel(a.serviceType)}`;
  return (
    <div className="mt-2 space-y-2 text-xs">
      {data.counted.length > 0 && (
        <div>
          <p className="font-medium text-muted-foreground">Grooms used</p>
          <ul className="mt-1 space-y-1">
            {data.counted.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{line(a)}</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy}
                  onClick={() => undo.mutate({ clientPackageId, appointmentId: a.id })}>
                  Take off
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {usable && data.available.length > 0 && (
        <div>
          <p className="font-medium text-muted-foreground">Count a groom against a booking</p>
          <ul className="mt-1 space-y-1">
            {data.available.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{line(a)}</span>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy}
                  onClick={() => count.mutate({ clientPackageId, appointmentId: a.id })}>
                  Use one
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Record grooms a client paid for up front: how many, how much, and when
 * the money arrived. For the clients who bank-transfer a year in advance
 * (Lauren, 19/11/2026). It records the payment; it does not take one.
 */
function AddPrepaidBlock({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [grooms, setGrooms] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const add = trpc.packages.addPrepaid.useMutation({
    onSuccess: () => {
      toast.success("Prepaid grooms recorded");
      setOpen(false); setName(""); setGrooms(""); setAmount(""); setPaidOn(""); setExpiresOn("");
      utils.packages.forClient.invalidate({ clientId });
    },
    onError: (e) => toast.error(e.message),
  });
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Record prepaid grooms</Button>
    );
  }
  const groomCount = Number(grooms);
  const amountPaid = Number(amount);
  const ready = name.trim() !== "" && Number.isInteger(groomCount) && groomCount > 0 && amount.trim() !== "" && Number.isFinite(amountPaid) && amountPaid >= 0;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">Record prepaid grooms</p>
      <p className="text-xs text-muted-foreground">
        For grooms already paid for another way, such as a bank transfer. This records it; nothing is charged.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground" htmlFor="prepaid-name">What it is</Label>
          <Input id="prepaid-name" className="h-9" placeholder="Silver membership, paid for the year" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="prepaid-grooms">Number of grooms</Label>
          <Input id="prepaid-grooms" className="h-9" inputMode="numeric" value={grooms} onChange={(e) => setGrooms(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="prepaid-amount">Amount paid ($)</Label>
          <Input id="prepaid-amount" className="h-9" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Date paid</Label>
          <DateField value={paidOn} onChange={setPaidOn} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Expires (optional)</Label>
          <DateField value={expiresOn} onChange={setExpiresOn} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={!ready || add.isPending}
          onClick={() => add.mutate({
            clientId, name: name.trim(), grooms: groomCount, amountPaid,
            paidOn: paidOn || undefined, expiresOn: expiresOn || undefined,
          })}
        >
          {add.isPending ? "Saving…" : "Record"}
        </Button>
      </div>
    </div>
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
  const { data } = trpc.petPaperwork.forClient.useQuery({ clientId });
  const [adding, setAdding] = useState<number | null>(null);
  const [kind, setKind] = useState(KINDS[0]);
  const [expiresOn, setExpiresOn] = useState("");

  const refresh = () => utils.petPaperwork.forClient.invalidate({ clientId });
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
                  onClick={() => remove.mutate({ id: record.id })}>
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
                  <DateField className="h-9 w-[9.5rem]" value={expiresOn} onChange={next => setExpiresOn(next)} />
                </div>
                <Button size="sm" disabled={save.isPending}
                  onClick={() => save.mutate({ petId: pet.petId, kind, expiresOn: expiresOn || undefined })}>
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

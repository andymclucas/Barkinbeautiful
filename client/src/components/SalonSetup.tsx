import { useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COPYABLE_CATALOGUES, CATALOGUE_LABELS, type CopyableCatalogue } from "@shared/salonProvisioning";

/**
 * Setting up a new salon, by typing its details in.
 *
 * The Pet Pad opens 23/11/2026 and is the first of these; there will be
 * more once Groomigo is sold to salons that are not Lauren's.
 *
 * ## Nothing is written until the plan has been read
 *
 * Creating a salon and copying a price list into it is not something to
 * discover the shape of afterwards, so the preview runs on every change
 * and prints the sentence and the row counts. The button below it does
 * exactly what the sentence says.
 *
 * ## It asks for an owner who already exists
 *
 * Not an email and a password. The person is usually somebody who
 * already runs a salon here — Lauren owns Barkin' Beautiful and is about
 * to own The Pet Pad — and the public signup still handles a brand-new
 * owner with their own verified address. Two paths to creating a login
 * is how they drift into a security difference.
 */
export function SalonSetup() {
  const { user } = useAuth();
  /*
   * Admin only, and the card simply does not appear otherwise — the same
   * shape as SalonSmsNumber beside it. Every procedure behind this is
   * adminProcedure, so a visible card that errors on load is worse than
   * no card at all.
   */
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("Australia/Brisbane");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [owner, setOwner] = useState<{ id: number; name: string } | null>(null);
  const [copyFrom, setCopyFrom] = useState<string>("none");
  const [catalogues, setCatalogues] = useState<CopyableCatalogue[]>([]);

  const salons = trpc.salons.mine.useQuery(undefined, { enabled: isAdmin });
  // Users, not staff records: provisioning puts somebody into a second
  // salon and never creates a login, so they must already have one.
  const owners = trpc.salons.eligibleOwners.useQuery(
    { query: ownerQuery },
    { enabled: isAdmin && ownerQuery.trim().length >= 2 },
  );

  const copyFromTenantId = copyFrom === "none" ? null : Number(copyFrom);
  const preview = trpc.salons.provisionPreview.useQuery(
    { salonName: name.trim() || "the new salon", copyFromTenantId, catalogues },
    { enabled: isAdmin && name.trim().length > 0 },
  );

  const provision = trpc.salons.provision.useMutation({
    onSuccess: (r) => {
      toast.success(`${name.trim()} created — it is at ${r.slug} and on a free trial.`, { duration: 10000 });
      setName(""); setEmail(""); setPhone(""); setOwner(null); setOwnerQuery("");
      setCopyFrom("none"); setCatalogues([]);
      void utils.salons.mine.invalidate();
    },
    onError: (e) => toast.error(e.message, { duration: 10000 }),
  });

  const toggle = (c: CopyableCatalogue) =>
    setCatalogues(current => current.includes(c) ? current.filter(x => x !== c) : [...current, c]);

  if (!isAdmin) return null;

  const ready = name.trim().length > 0 && owner !== null && timezone.trim().length > 0;

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" /> Add a salon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="salon-name">Salon name</Label>
            <Input id="salon-name" value={name} onChange={e => setName(e.target.value)} placeholder="The Pet Pad" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salon-phone">Phone</Label>
            <Input id="salon-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07 ..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salon-email">Email</Label>
            <Input id="salon-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salon-tz">Timezone</Label>
            {/* Typed, not assumed. A salon on the wrong clock shows every
                booking at the wrong hour, and the server refuses a value
                it does not recognise rather than quietly making it
                Brisbane. */}
            <Input id="salon-tz" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Australia/Brisbane" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="salon-owner">Owner</Label>
          {owner ? (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{owner.name}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7"
                onClick={() => { setOwner(null); setOwnerQuery(""); }}>Change</Button>
            </div>
          ) : (
            <>
              <Input id="salon-owner" value={ownerQuery} onChange={e => setOwnerQuery(e.target.value)}
                placeholder="Search someone who already has a login" />
              {(owners.data ?? []).length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  {(owners.data ?? []).map(candidate => (
                    <button key={candidate.id} type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10"
                      onClick={() => setOwner({ id: candidate.id, name: candidate.name })}>
                      <span className="font-medium">{candidate.name}</span>
                      {candidate.email && (
                        <span className="truncate text-xs text-muted-foreground">{candidate.email}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Label>Start its catalogue from</Label>
          <Select value={copyFrom} onValueChange={setCopyFrom}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nothing — enter everything by hand</SelectItem>
              {(salons.data?.salons ?? []).map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {copyFromTenantId !== null && (
            <div className="flex flex-wrap gap-2 pt-1">
              {COPYABLE_CATALOGUES.map(c => (
                <button key={c} type="button" onClick={() => toggle(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    catalogues.includes(c)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}>
                  {CATALOGUE_LABELS[c]}
                </button>
              ))}
            </div>
          )}

          {/* A copy is somewhere to start editing, not an answer — a new
              salon will not charge another one's prices. Saying so here
              stops it being discovered afterwards. */}
          <p className="text-[11px] leading-4 text-muted-foreground">
            A copy is a starting point to edit, not a price list to keep. No clients,
            pets, bookings or staff are ever copied between salons.
          </p>
        </div>

        {name.trim().length > 0 && preview.data && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p>{preview.data.plan}</p>
            {Object.keys(preview.data.counts).length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {Object.entries(preview.data.counts).map(([c, n]) => (
                  <li key={c}>{CATALOGUE_LABELS[c as CopyableCatalogue]}: {n} to copy</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button
          disabled={!ready || provision.isPending}
          onClick={() => owner && provision.mutate({
            salonName: name.trim(),
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            timezone: timezone.trim(),
            ownerUserId: owner.id,
            ownerName: owner.name,
            copyFromTenantId,
            catalogues,
          })}
        >
          {provision.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
            : <><Plus className="mr-2 h-4 w-4" />Create salon</>}
        </Button>
        {!ready && (
          <p className="text-xs text-muted-foreground">
            A name, a timezone and an owner who already has a login are needed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

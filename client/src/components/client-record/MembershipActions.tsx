import { useState } from "react";
import { Plus, Loader2, Info, CreditCard, TriangleAlert, Link2, Mail, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brisbaneDateKey } from "@shared/localDateTime";
import type { MembershipWeightClass } from "@shared/membershipPackages";

type Pet = { id: number; name: string; breed?: string | null };

const WEIGHT_CLASSES: readonly MembershipWeightClass[] = [
  "small", "small_medium", "medium", "large", "extra_large", "giant",
];

function asWeightClass(value: string): MembershipWeightClass | undefined {
  return WEIGHT_CLASSES.find((c) => c === value);
}

/** "4-weekly", from the plan's own interval — a Diamond at 4 weeks and one at 6 are different money. */
function intervalLabel(weeks: number): string {
  return weeks === 1 ? "weekly" : `${weeks}-weekly`;
}

/**
 * Put a membership on a client's record while they are still on the phone.
 *
 * Andy, 08/10/2026: "If I wanted to do a quick add of a membership to a
 * client while on the phone to them... I could do it directly from there."
 *
 * It creates the arrangement WITHOUT starting the weekly charge — Andy
 * again: "have the option to add the membership before 'making it live' by
 * clicking 'Set Weekly Billing'". So this is the safe half: no money moves
 * and no date is set, and the membership reads "Added — not billing yet"
 * until somebody deliberately starts it.
 */
export function AddMembershipButton({ clientId, pets, onChanged }: {
  clientId: number;
  pets: Pet[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // One dog means there is nothing to choose. Same reasoning as 9758e33.
  const [petId, setPetId] = useState<string>(pets.length === 1 ? String(pets[0].id) : "");
  const [packageId, setPackageId] = useState<string>("");
  const [band, setBand] = useState<string>("");

  const options = trpc.memberships.getPackageOptions.useQuery(
    { clientId, petId: Number(petId) },
    { enabled: open && petId !== "", retry: false },
  );

  const create = trpc.memberships.create.useMutation({
    onSuccess: () => {
      toast.success("Membership added — not billing yet", {
        description: "Press Set Weekly Billing when the card is sorted.",
      });
      onChanged();
      close();
    },
    onError: (error) => toast.error(error.message),
  });

  function close() {
    setOpen(false);
    setPetId(pets.length === 1 ? String(pets[0].id) : "");
    setPackageId("");
    setBand("");
  }

  const data = options.data;
  // A dog with a weight on file gets its band outright. One with only a size
  // band gets it suggested — 333 active dogs are in that position, and making
  // somebody re-pick a band we already hold is busywork. It stays a
  // suggestion, because the band sets the weekly price.
  const suggested = data?.suggestedBand ?? null;
  const needsBand = Boolean(data?.requiresManualWeightSelection);
  const chosenBand = band || suggested?.id || "";
  const weightClass = needsBand ? asWeightClass(chosenBand) : undefined;
  const chosen = data?.packages.find((p) => p.id === packageId) ?? null;

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)} disabled={pets.length === 0}>
        <Plus className="h-4 w-4" /> Add membership
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add a membership</DialogTitle>
            <DialogDescription className="text-xs">
              Records the arrangement. Nothing is charged yet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {pets.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Which dog</label>
                <Select value={petId} onValueChange={(v) => { setPetId(v); setPackageId(""); setBand(""); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a dog" /></SelectTrigger>
                  <SelectContent>
                    {pets.map((pet) => (
                      <SelectItem key={pet.id} value={String(pet.id)}>
                        {pet.name}{pet.breed ? ` · ${pet.breed}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {pets.length === 1 && (
              <p className="text-xs text-muted-foreground">
                For <strong>{pets[0].name}</strong>{pets[0].breed ? ` · ${pets[0].breed}` : ""}
              </p>
            )}

            {petId !== "" && options.isLoading && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Finding this dog's packages…
              </p>
            )}
            {options.error && (
              <p className="text-xs text-red-600 dark:text-red-400">{options.error.message}</p>
            )}

            {data?.weightBand && (
              <p className="text-xs text-muted-foreground">
                {data.recordedWeight} kg on file — <strong>{data.weightBand.label}</strong>.
              </p>
            )}

            {data && needsBand && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Size band</label>
                <Select value={chosenBand} onValueChange={setBand}>
                  <SelectTrigger><SelectValue placeholder="Choose a size" /></SelectTrigger>
                  <SelectContent>
                    {data.weightBands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {suggested
                    ? <>Suggested <strong>{suggested.label}</strong> from this dog's recorded size
                        {data.suggestedBandSource === "moego_service"
                          ? ", which was read off an old MoeGo service name — worth checking"
                          : ""}. No weight is on file, and the band sets the price.</>
                    : <>No weight or size on this dog's record, and the band sets the price.</>}
                </p>
              </div>
            )}

            {data && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Package</label>
                <Select value={packageId} onValueChange={setPackageId}>
                  <SelectTrigger><SelectValue placeholder="Choose a package" /></SelectTrigger>
                  <SelectContent>
                    {data.packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — ${p.weeklyPrice}/wk, {intervalLabel(p.appointmentIntervalWeeks)}
                        {p.custom ? " · salon plan" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {data.packages.length === 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    No packages for this size band. Add one on the Pricing screen.
                  </p>
                )}
                {chosen && (
                  <p className="text-[11px] text-muted-foreground">
                    ${chosen.weeklyPrice}/wk · a groom every {chosen.appointmentIntervalWeeks} weeks · {chosen.visitsPerYear} a year
                  </p>
                )}
              </div>
            )}

            <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Nothing is charged and no billing date is set until somebody presses{" "}
                <strong>Set Weekly Billing</strong>.
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
            <Button
              size="sm"
              disabled={
                create.isPending || petId === "" || packageId === "" || (needsBand && !weightClass)
              }
              onClick={() => create.mutate({
                clientId,
                petId: Number(petId),
                packageId,
                ...(weightClass ? { manualWeightClass: weightClass } : {}),
                startPending: true,
              })}
            >
              {create.isPending ? "Adding…" : "Add membership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Start charging a membership Groomigo is not charging for.
 *
 * This is the other half of the flag added in 8056242. All 154 of the
 * salon's memberships read "✓ Active" and totalled $4,101 a week that
 * Groomigo collected none of, because they are still being billed in MoeGo.
 * Saying so was the first step; this is the button that fixes one.
 *
 * It sets the schedule — status, first charge date, gateway. It does NOT
 * take a card: nobody enters card details here, and the dialog says so,
 * because "it is now billing" and "a card exists to bill" are different
 * facts and conflating them is how the $4,101 went unnoticed.
 *
 * Owner-only, matching the server's `requireStaffAdministrator`. Gate the
 * caller on `canAdministerStaff`, not on `role === "admin"` — four groomers
 * hold that role.
 */
export function SetWeeklyBillingButton({ membership, clientId, clientEmail, hasCardOnFile, onChanged }: {
  membership: { id: number; name: string; pricePerCycle: string | number; petName?: string | null };
  clientId: number;
  clientEmail?: string | null;
  hasCardOnFile: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstCharge, setFirstCharge] = useState(() => brisbaneDateKey());
  const [gateway, setGateway] = useState<"stripe" | "square" | "cash" | "other">(
    hasCardOnFile ? "stripe" : "other",
  );

  // Two different things called "start billing", and picking the wrong one
  // is how the salon ended up with 154 memberships that charged nobody.
  //
  //   startSubscription  creates a real recurring charge at Stripe. The
  //                      only one that actually takes money.
  //   setWeeklyBilling   records that money is coming in some other way —
  //                      cash at the counter, or still through MoeGo.
  //
  // So a card on file plus Stripe means the first; everything else means
  // the second, and the dialog says which is about to happen.
  const useStripe = hasCardOnFile && gateway === "stripe";

  const onDone = (description: string) => {
    toast.success("Weekly billing set", { description });
    onChanged();
    setOpen(false);
  };

  const subscribe = trpc.stripeCards.startSubscription.useMutation({
    onSuccess: (result) => onDone(
      result.alreadyExisted
        ? `${membership.name} was already billing at Stripe.`
        : `Stripe will charge $${membership.pricePerCycle} a week from ${firstCharge}.`,
    ),
    onError: (error) => toast.error(error.message),
  });
  const schedule = trpc.memberships.setWeeklyBilling.useMutation({
    onSuccess: () => onDone(`${membership.name} is marked as billing from ${firstCharge}.`),
    onError: (error) => toast.error(error.message),
  });
  const pending = subscribe.isPending || schedule.isPending;

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <CreditCard className="h-3.5 w-3.5" /> Set Weekly Billing
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Start weekly billing</DialogTitle>
            <DialogDescription className="text-xs">
              {membership.name}
              {membership.petName ? ` · ${membership.petName}` : ""} · ${membership.pricePerCycle}/wk
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">First charge date</label>
              <Input
                type="date"
                value={firstCharge}
                onChange={(e) => setFirstCharge(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Brisbane time. Today by default.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Charged through</label>
              <Select value={gateway} onValueChange={(v) => setGateway(v as typeof gateway)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">Stripe — card on file</SelectItem>
                  <SelectItem value="cash">Cash or card in salon</SelectItem>
                  <SelectItem value="square">Square</SelectItem>
                  <SelectItem value="other">Other / still in MoeGo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!hasCardOnFile && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 dark:border-amber-900/50 dark:bg-amber-950/40">
                <p className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {gateway === "stripe"
                      ? "No card on file, so Stripe has nothing to charge. Ask the client for one now, or pick another method."
                      : "No card on file. Fine if you are taking the money another way — otherwise ask the client for one."}
                  </span>
                </p>
                <SendCardLinkButton clientId={clientId} clientEmail={clientEmail} hasCardOnFile={false} variant="secondary" />
              </div>
            )}

            <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {useStripe
                  ? <>Stripe will charge the card on file <strong>${membership.pricePerCycle} every week</strong>,
                      starting on the date above. Nothing is taken today.</>
                  : <>This records the arrangement so the membership stops showing as unbilled.
                      Groomigo will <strong>not</strong> charge anything — you are collecting this
                      another way.</>}
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(firstCharge)}
              onClick={() => useStripe
                ? subscribe.mutate({ membershipId: membership.id, firstChargeOn: firstCharge })
                : schedule.mutate({
                    membershipId: membership.id,
                    nextBillingDate: firstCharge,
                    paymentGateway: gateway,
                  })}
            >
              {pending ? "Setting…" : useStripe ? "Start charging weekly" : "Set weekly billing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Send the client a Stripe link to put a card on file.
 *
 * The link goes to Stripe Checkout in setup mode: the client types their card
 * into Stripe's page, Stripe tells us via webhook, and Groomigo stores a token
 * and the last four digits. No card number passes through this app, which is
 * what keeps the salon out of PCI scope — and it is why there is no "type the
 * client's card in for them" option anywhere, by design.
 *
 * Email and copy are separate buttons rather than one "send" that picks a
 * channel, because emailing a real client is a deliberate act and the salon
 * knows better than this code whether the client reads email or texts.
 *
 * Needed because NOTHING came across from MoeGo: of 10,093 clients exactly one
 * has a card on file. MoeGo's saved cards live in MoeGo's own payment account
 * and cannot be transferred, so all 154 memberships need the client to re-enter
 * a card. This button is the whole migration path.
 */
export function SendCardLinkButton({ clientId, clientEmail, hasCardOnFile, variant = "outline" }: {
  clientId: number;
  clientEmail?: string | null;
  hasCardOnFile: boolean;
  variant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const createLink = trpc.stripeCards.createSetupLink.useMutation({
    onSuccess: ({ url }) => setLink(url),
    onError: (error) => toast.error(error.message),
  });
  const emailLink = trpc.stripeCards.emailSetupLink.useMutation({
    onSuccess: () => toast.success(`Card link emailed to ${clientEmail}`),
    onError: (error) => toast.error(error.message),
  });

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — paste it into a text message");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <>
      <Button size="sm" variant={variant} className="gap-1.5" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5" /> {hasCardOnFile ? "Send new card link" : "Send card link"}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setLink(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Ask for a card</DialogTitle>
            <DialogDescription className="text-xs">
              {hasCardOnFile
                ? "Replaces the card currently on file once they save a new one."
                : "The client enters their own card on Stripe's secure page."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              className="w-full justify-start gap-2"
              disabled={emailLink.isPending || !clientEmail}
              onClick={() => emailLink.mutate({ clientId })}
            >
              <Mail className="h-4 w-4" />
              {emailLink.isPending
                ? "Emailing…"
                : clientEmail ? `Email it to ${clientEmail}` : "No email address on file"}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              disabled={createLink.isPending}
              onClick={() => createLink.mutate({ clientId })}
            >
              <Link2 className="h-4 w-4" />
              {createLink.isPending ? "Making a link…" : "Get a link to text them"}
            </Button>

            {link && (
              <div className="space-y-1.5 rounded-md border bg-muted/40 p-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Single-use link. Make a fresh one if they lose it.
                </p>
                <p className="break-all font-mono text-[11px] leading-4">{link}</p>
                <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void copy(link)}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
            )}

            <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Stripe takes the card details, not us — we never see the full number. Nothing is
                charged when they save it.
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); setLink(null); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

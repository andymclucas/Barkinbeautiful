import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dog, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { SIZE_BAND_IDS, SIZE_BAND_SOURCE_LABELS, sizeBandLabel, type DogSizeBand, type SizeBandSource } from "@shared/dogSizeBand";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addOnRequiresManualPrice } from "@shared/appointmentAddOns";
import {
  bookingTotal,
  formatPriceAud,
  groomPriceOptions,
  pickDefaultPriceOption,
  serviceQuickPicks,
  PRICE_TIER_LABELS,
  type PriceOption,
  type PriceTier,
} from "@shared/groomPricing";

/**
 * A price per dog, taken from the salon's own price list.
 *
 * The dialog used to offer one "Price ($)" box for the whole booking.
 * With two dogs that is one number and two appointment rows, so the salon
 * put the family's whole fee on the first dog and left the sibling NULL —
 * 80 of the 102 unpriced appointments found on 12/10/2026. Lauren's note
 * about MoeGo is the same point from the other side: "see how their last
 * pricing is already correct? and split.. In Groomigo I had to guess."
 *
 * So: one card per dog, each with its own figure pre-filled from the
 * catalogue, and an estimated total underneath.
 */

export type StagedAddOn = {
  pricingServiceId: number;
  quantity: number;
  unitPrice?: number;
  /** For showing the line before the appointment exists. */
  name: string;
  displayPrice: string;
};

type Props = {
  clientId: number;
  petIds: number[];
  serviceType: string;
  /** The membership pays for the groom; the box is forced to zero. */
  membershipCovered: boolean;
  priceByPetId: Record<string, string>;
  onPricesChange: (next: Record<string, string>) => void;
  addOnsByPetId: Record<string, StagedAddOn[]>;
  onAddOnsChange: (next: Record<string, StagedAddOn[]>) => void;
  onServiceTypeChange: (serviceType: string) => void;
  /** Book again also restores the groomer and the length of the last groom. */
  onRepeatLast?: (last: { staffId: number | null; durationMinutes: number | null }) => void;
};

export function BookingPetPricing(props: Props) {
  const { clientId, petIds, serviceType, membershipCovered } = props;
  const utils = trpc.useUtils();

  const catalogueQuery = trpc.bookingPricing.catalogue.useQuery(
    {},
    // The price list changes a few times a year. Re-fetching it on every
    // dialog open costs a query and buys nothing.
    { staleTime: 5 * 60 * 1000 },
  );
  const contextQuery = trpc.bookingPricing.context.useQuery(
    { clientId, petIds },
    { enabled: clientId > 0 && petIds.length > 0 },
  );
  const addOnCatalogueQuery = trpc.appointmentAddOns.catalogue.useQuery({});

  const catalogue = useMemo(() => catalogueQuery.data ?? [], [catalogueQuery.data]);
  const context = contextQuery.data;
  // A dog not yet loaded is assumed to be a non-member, which is the
  // commonest case and the dearer of the two — an empty box is better than
  // one briefly showing a members' rate to somebody who is not a member.
  const DEFAULT_TIER: PriceTier = "new";

  /**
   * A band the staff member has chosen in this dialog but not yet saved.
   *
   * Kept locally so the prices update on the tap rather than after the
   * round trip, while `pets.updateSizeBand` writes it to the dog's record
   * in the background — 9,359 dogs have neither a weight nor a band, and
   * filling one in while booking is how that number comes down.
   */
  const [localBand, setLocalBand] = useState<Record<string, DogSizeBand>>({});

  /**
   * Narrow the price list to this dog and this service, or show all of it.
   *
   * On by default, as Andy asked: the whole list is 43 rows and nobody
   * reads that on every booking. Unticking is the escape hatch for the
   * cases the bands do not describe — a small dog so matted it is charged
   * as a medium, or a service priced off-label.
   */
  const [applicableOnly, setApplicableOnly] = useState(true);

  const setBandMutation = trpc.pets.updateSizeBand.useMutation({
    onSuccess: () => {
      void utils.bookingPricing.context.invalidate();
      void utils.pets.listByClient.invalidate({ clientId });
    },
    onError: (error) => toast.error(error.message),
  });

  const petRows = useMemo(() => {
    const byId = new Map((context?.pets ?? []).map((pet) => [pet.petId, pet]));
    // Driven by petIds, not by the query, so the cards appear in the order
    // the dogs were picked and a slow query does not reorder them.
    return petIds.map((petId) => {
      const pet = byId.get(petId);
      const band = (localBand[String(petId)] ?? pet?.sizeBand ?? null) as DogSizeBand | null;
      // The rate follows this dog's own membership, not the household's.
      const tier = (pet?.tier ?? DEFAULT_TIER) as PriceTier;
      return { petId, pet, band, tier };
    });
  }, [petIds, context?.pets, localBand]);

  // What the default price is worked out from — always this dog and this
  // service, whatever the dropdown is currently showing. Widening the list
  // must not change what the box was filled with.
  const optionsByPetId = useMemo(() => {
    const map: Record<string, PriceOption[]> = {};
    for (const row of petRows) {
      map[String(row.petId)] = groomPriceOptions({ serviceType, sizeBand: row.band, catalogue });
    }
    return map;
  }, [petRows, serviceType, catalogue]);

  // What the dropdown lists.
  const shownOptionsByPetId = useMemo(() => {
    if (applicableOnly) return optionsByPetId;
    const map: Record<string, PriceOption[]> = {};
    for (const row of petRows) {
      map[String(row.petId)] = groomPriceOptions({ serviceType, sizeBand: row.band, catalogue, scope: "all" });
    }
    return map;
  }, [applicableOnly, optionsByPetId, petRows, serviceType, catalogue]);

  /**
   * Re-fill the boxes when the booking genuinely changes shape.
   *
   * Keyed on a signature rather than on the query objects, because those
   * re-resolve on every invalidation and an effect that ran then would
   * wipe a figure a staff member had just typed. A different service, a
   * different dog or a newly chosen size band is a real change and should
   * re-price; a refetch is not.
   *
   * Changing the service re-prices EVERY dog, deliberately: a classic
   * groom's figure is not a styled groom's, so carrying it over would
   * leave a wrong number in a box that looks filled in.
   */
  const signatureFor = (service: string) =>
    `${service}|${petRows.map((r) => `${r.petId}:${r.band ?? ""}:${r.tier}`).join(",")}|${catalogue.length}`;
  const signature = signatureFor(serviceType);
  const lastSignature = useRef<string>("");

  useEffect(() => {
    if (catalogue.length === 0 || petRows.length === 0) return;
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    const next: Record<string, string> = {};
    for (const row of petRows) {
      const option = pickDefaultPriceOption(optionsByPetId[String(row.petId)] ?? [], row.tier);
      // No catalogue price for this size and service leaves the box empty
      // rather than borrowing another tier's figure. Quoting a first-timer
      // the members' rate loses $35 a groom and nobody would notice.
      if (option?.priceAud) next[String(row.petId)] = option.priceAud;
    }
    props.onPricesChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /**
   * Repeat the client's last booking: the same service, each dog's own
   * figure, and the extras that went with it.
   *
   * It has to claim the signature it is about to produce. Book again
   * changes the service, which is exactly what the effect above watches,
   * so without this the effect would run a moment later and overwrite
   * every price it had just restored with the catalogue default.
   */
  const repeatLastBooking = () => {
    const repeatable = petRows.filter((row) => row.pet?.last);
    if (repeatable.length === 0) return;
    const service = repeatable[0].pet!.last!.serviceType;

    const prices: Record<string, string> = { ...props.priceByPetId };
    const addOns: Record<string, StagedAddOn[]> = { ...props.addOnsByPetId };
    for (const row of repeatable) {
      const last = row.pet!.last!;
      /**
       * The service repeats; the PRICE comes from the catalogue.
       *
       * Andy, 22/10/2026: "Leave all ones that have been brought across
       * from MoeGo with the prices as is, but any new ones need to
       * reflect pricing on Groomigo."
       *
       * 450 of 456 upcoming bookings were imported from MoeGo and 88% of
       * them carry a price the Groomigo catalogue does not recognise.
       * Copying `last.price` therefore walked a MoeGo figure into a
       * brand-new Groomigo booking nearly every time — which is the one
       * way a new booking could still be priced from the old system.
       *
       * Falls back to the previous figure only when the catalogue cannot
       * answer, because an empty price box invoices as zero.
       */
      const fromCatalogue = pickDefaultPriceOption(
        groomPriceOptions({ serviceType: service, sizeBand: row.band, catalogue }),
        row.tier,
      )?.priceAud ?? null;
      const repeated = fromCatalogue ?? (last.price || null);
      if (repeated) prices[String(row.petId)] = repeated;
      const carried = last.addOns
        .filter((addOn) => addOn.pricingServiceId)
        .map((addOn) => ({
          pricingServiceId: addOn.pricingServiceId as number,
          quantity: addOn.quantity,
          unitPrice: Number(addOn.unitPrice),
          name: addOn.name,
          displayPrice: Number(addOn.unitPrice).toFixed(2),
        }));
      if (carried.length > 0) addOns[String(row.petId)] = carried;
    }

    lastSignature.current = signatureFor(service);
    props.onServiceTypeChange(service);
    props.onPricesChange(prices);
    props.onAddOnsChange(addOns);
    const first = repeatable[0].pet!.last!;
    props.onRepeatLast?.({ staffId: first.staffId, durationMinutes: first.durationMinutes });
    toast.success(
      repeatable.length === 1
        ? `Repeated ${repeatable[0].pet?.name ?? "the dog"}'s last groom`
        : `Repeated the last booking for ${repeatable.length} dogs`,
    );
  };
  const repeatablePets = petRows.filter((row) => row.pet?.last);

  const quickPicks = useMemo(
    // The figure on each button is what the booking TOTAL becomes if it is
    // tapped — every dog priced at its own size and added up. It is blank
    // when any dog has no listed price, rather than borrowing a figure from
    // a size none of them are.
    () => serviceQuickPicks({
      dogs: petRows.map((row) => ({ sizeBand: row.band, tier: row.tier })),
      catalogue,
    }),
    [petRows, catalogue],
  );

  const prices = petIds.map((petId) =>
    membershipCovered ? "0.00" : props.priceByPetId[String(petId)] ?? null,
  );
  // Every extra on the booking, whichever dog it belongs to. The total is
  // what staff read out to the client, so it has to be the real figure.
  const extras = petIds.flatMap((petId) =>
    (props.addOnsByPetId[String(petId)] ?? []).map(
      (addOn) => Number(addOn.displayPrice) * Math.max(1, addOn.quantity),
    ),
  );
  const total = bookingTotal(prices, extras);
  const addOnCatalogue = addOnCatalogueQuery.data ?? [];

  const setPrice = (petId: number, value: string) =>
    props.onPricesChange({ ...props.priceByPetId, [String(petId)]: value });

  const chooseBand = (petId: number, band: DogSizeBand) => {
    setLocalBand((current) => ({ ...current, [String(petId)]: band }));
    setBandMutation.mutate({ petId, sizeBand: band });
  };

  /**
   * Overriding a size the dog already has.
   *
   * Picking a band when there is none is just filling a blank, and goes
   * straight through. Changing one that is already set is different: it
   * overwrites the dog's record for every future booking, not only this
   * one, and when the band came from a recorded weight it also puts the
   * two in open disagreement. That is sometimes exactly right — a
   * heavily matted dog grooms like the band above — but it should be a
   * decision somebody makes, not a dropdown they brush past.
   */
  const [editingBandFor, setEditingBandFor] = useState<number | null>(null);
  const [pendingBand, setPendingBand] = useState<{ petId: number; band: DogSizeBand } | null>(null);
  const pendingRow = pendingBand ? petRows.find((r) => r.petId === pendingBand.petId) : null;

  const requestBandChange = (petId: number, band: DogSizeBand, currentBand: DogSizeBand | null) => {
    if (!currentBand) { chooseBand(petId, band); return; }
    if (band === currentBand) { setEditingBandFor(null); return; }
    setPendingBand({ petId, band });
  };

  const addStagedAddOn = (petId: number, addOn: StagedAddOn) =>
    props.onAddOnsChange({
      ...props.addOnsByPetId,
      [String(petId)]: [...(props.addOnsByPetId[String(petId)] ?? []), addOn],
    });

  const removeStagedAddOn = (petId: number, index: number) =>
    props.onAddOnsChange({
      ...props.addOnsByPetId,
      [String(petId)]: (props.addOnsByPetId[String(petId)] ?? []).filter((_, i) => i !== index),
    });

  if (petIds.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-1.5 text-sm">
          <Dog className="h-3.5 w-3.5 text-primary" /> Price per dog
        </Label>
        <span className="flex items-center gap-3 text-sm font-semibold tabular-nums">
          {!membershipCovered && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={applicableOnly}
                onChange={(e) => setApplicableOnly(e.target.checked)}
              />
              Only show applicable services
            </label>
          )}
          {membershipCovered ? (
            <span className="text-emerald-700 dark:text-emerald-300">Covered by membership</span>
          ) : total.complete ? (
            `Total $${total.total}`
          ) : (
            <span className="text-amber-700 dark:text-amber-300">
              ${total.total} · a dog still needs a price
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* The quick picks are the fast path Andy asked for: tap Classic or
            Styled and the figure for this dog's size lands in the box. They
            are hidden on a membership booking, where the groom is $0.00 and
            the service is whatever the membership covers. */}
        {!membershipCovered && quickPicks.map((pick) => (
          <Button
            key={pick.serviceType}
            type="button"
            size="sm"
            variant={serviceType === pick.serviceType ? "default" : "outline"}
            className="h-8 gap-1.5 text-xs"
            onClick={() => props.onServiceTypeChange(pick.serviceType)}
          >
            {pick.label}
            {pick.total && <span className="opacity-80">{formatPriceAud(pick.total)}</span>}
          </Button>
        ))}
        {/* Offered on a membership booking too — those are the clients who
            rebook every four to eight weeks, and repeating still restores
            the service, the groomer and the extras. */}
        {repeatablePets.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={repeatLastBooking}
          >
            <RotateCcw className="h-3 w-3" /> Book again
          </Button>
        )}
      </div>

      {petRows.map((row) => {
        const key = String(row.petId);
        const options = optionsByPetId[key] ?? [];
        const shownOptions = shownOptionsByPetId[key] ?? [];
        const staged = props.addOnsByPetId[key] ?? [];
        const last = row.pet?.last ?? null;
        const needsBand = !row.band;
        const facts = [
          row.pet?.breed,
          row.pet?.weightKg ? `${Number(row.pet.weightKg)} kg` : null,
          row.band ? sizeBandLabel(row.band) : null,
        ].filter(Boolean);

        return (
          // Andy, 19/10: "noticeable boxes around each dog that has the
          // price plus add-ons inside each of those boxes. So it is
          // obvious to the staff member which things they are adding to
          // which dog."
          //
          // A shared picker with a dog dropdown was tried first, then the
          // dropdown was made loud. The dropdown was always the weak
          // point: it keeps its last choice, and a de-matt on the wrong
          // Cavoodle is a real charge on a real invoice. A box you are
          // inside cannot be mistaken for another dog's.
          <div
            key={key}
            className="min-w-0 space-y-2.5 overflow-hidden rounded-xl border-2 bg-card p-3 shadow-sm"
          >
            {/* Nothing in this row may refuse to shrink except the one
                short control. The facts used to carry shrink-0, which was
                harmless while they sat alone — then "change size" was put
                inside the same span and the pair pushed the row wider
                than the box it is in. A breed like "Labradoodle (medium)"
                beside a band label is easily enough to do it.
                min-w-0 on both sides is what lets truncate actually
                truncate; without it a flex child's minimum is its content. */}
            <div className="flex min-w-0 items-baseline justify-between gap-2 border-b pb-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {row.pet?.name ?? `Pet ${row.petId}`}
              </span>
              {facts.length > 0 && (
                <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{facts.join(" · ")}</span>
                  {/* Only when there is a size to override. With none, the
                      picker below is already showing. Kept unshrinkable
                      because a half-truncated "change si…" is useless. */}
                  {row.band && (
                    <button
                      type="button"
                      className="shrink-0 whitespace-nowrap underline underline-offset-2 hover:text-foreground"
                      onClick={() => setEditingBandFor(editingBandFor === row.petId ? null : row.petId)}
                    >
                      {editingBandFor === row.petId ? "cancel" : "change size"}
                    </button>
                  )}
                </span>
              )}
            </div>

            {/* 10,372 of 12,552 dogs have no recorded weight, so this is the
                normal path, not a fallback. Choosing here prices the groom
                and fills the dog's record in at the same time. */}
            {(needsBand || editingBandFor === row.petId) && (
              <div className="space-y-1">
                <Select
                  value=""
                  onValueChange={(v) => requestBandChange(row.petId, v as DogSizeBand, row.band)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={
                      needsBand
                        ? "No weight on file — pick a size to price it"
                        : `Currently ${sizeBandLabel(row.band!)} — pick a different size`
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_BAND_IDS.map((band) => (
                      <SelectItem key={band} value={band}>{sizeBandLabel(band)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="w-24 shrink-0 space-y-1">
                <Label className="text-[11px] text-muted-foreground">Price ($)</Label>
                <Input
                  className="h-8 text-xs tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={membershipCovered}
                  value={membershipCovered ? "0.00" : props.priceByPetId[key] ?? ""}
                  onChange={(e) => setPrice(row.petId, e.target.value)}
                />
              </div>
              {!membershipCovered && shownOptions.length > 0 && (
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">From the price list</Label>
                  <Select
                    value={shownOptions.find((o) => o.priceAud === props.priceByPetId[key])?.id.toString() ?? ""}
                    onValueChange={(v) => {
                      const option = shownOptions.find((o) => String(o.id) === v);
                      if (option?.priceAud) setPrice(row.petId, option.priceAud);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a listed price" />
                    </SelectTrigger>
                    <SelectContent>
                      {shownOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          <span className="flex w-full items-center justify-between gap-3">
                            {/* Narrowed to this dog and this service, the
                                tier is the only thing that differs, so that
                                is what to read. Showing everything, the
                                full name is the only way to tell rows
                                apart. */}
                            <span className="truncate">
                              {applicableOnly && option.tier ? PRICE_TIER_LABELS[option.tier] : option.name}
                            </span>
                            <span className="text-muted-foreground">
                              {option.requiresManualPrice ? "quote" : formatPriceAud(option.priceAud)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!membershipCovered && shownOptions.length === 0 && row.band && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                The price list has no {sizeBandLabel(row.band).toLowerCase()} price for this service — enter what was agreed.
              </p>
            )}

            {/* The list has prices for this dog and this service, but none
                at this client's tier — a styled groom on a small dog has a
                new-client and a VIP price and no regular one, which is 105
                of the upcoming bookings. Saying so beats an empty box that
                looks like a bug, and borrowing another tier's figure would
                quietly misprice it. */}
            {!membershipCovered && options.length > 0
              && !pickDefaultPriceOption(options, row.tier)
              && !props.priceByPetId[key] && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                No {PRICE_TIER_LABELS[row.tier].toLowerCase()} price is listed for this groom — pick one of the listed prices or type the agreed amount.
              </p>
            )}

            {/* What this dog had last time, for reference. Repeating is one
                action for the whole booking, below. */}
            {last && (
              <p className="truncate text-[11px] text-muted-foreground">
                Last time: {formatPriceAud(last.price) ?? "no price recorded"}
                {last.addOns.length > 0 && ` + ${last.addOns.length} extra${last.addOns.length > 1 ? "s" : ""}`}
              </p>
            )}

            {/* This dog's extras, in this dog's box. The picker adds to
                row.petId and nothing else, so there is no target to get
                wrong. */}
            <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Extras for {row.pet?.name ?? "this dog"}
              </Label>
              <AddOnPicker
                catalogue={addOnCatalogue}
                onAdd={(addOn) => addStagedAddOn(row.petId, addOn)}
              />
              {staged.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No extras on this dog.</p>
              )}
            {staged.length > 0 && (
              <div className="space-y-1">
                {staged.map((addOn, index) => (
                  <div key={`${addOn.pricingServiceId}-${index}`} className="flex items-center gap-2 rounded bg-background px-2 py-1 text-[11px]">
                    <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{addOn.name}</span>
                    {addOn.quantity > 1 && <span className="shrink-0 text-muted-foreground">× {addOn.quantity}</span>}
                    <span className="shrink-0 font-medium tabular-nums">${addOn.displayPrice}</span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      title={`Remove ${addOn.name}`}
                      onClick={() => removeStagedAddOn(row.petId, index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            </div>

          </div>
        );
      })}

      {/* Extras are charged even when the groom is not: the weekly payment
          covers the cut, not the de-matt done on the day. */}
      {membershipCovered && (
        <p className="text-[11px] text-muted-foreground">
          The groom is covered by the membership. Anything added above is still invoiced.
        </p>
      )}

      {/* The accept step for a size override. It names what is recorded,
          where that came from, and what changing it does beyond this
          booking — because pets.size_band is the dog's record, not a
          field on this appointment. */}
      <Dialog open={pendingBand !== null} onOpenChange={(open) => { if (!open) setPendingBand(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Change {pendingRow?.pet?.name ?? "this dog"}&rsquo;s size?
            </DialogTitle>
          </DialogHeader>

          {pendingBand && pendingRow && (
            <div className="space-y-3 py-1 text-sm">
              <p>
                Recorded as{" "}
                <span className="font-semibold">{sizeBandLabel(pendingRow.band!)}</span>
                {pendingRow.pet?.weightKg ? ` from ${Number(pendingRow.pet.weightKg)} kg on file` : ""}
                {pendingRow.pet?.sizeBandSource
                  ? ` (${SIZE_BAND_SOURCE_LABELS[pendingRow.pet.sizeBandSource as SizeBandSource]
                      ?? pendingRow.pet.sizeBandSource})`
                  : ""}
                .
              </p>
              <p>
                Changing it to{" "}
                <span className="font-semibold">{sizeBandLabel(pendingBand.band)}</span>{" "}
                reprices this groom and updates {pendingRow.pet?.name ?? "the dog"}&rsquo;s record for
                every future booking.
              </p>
              {/* Worth saying out loud: the weight is NOT changed, so the
                  two will disagree afterwards and the card will show both. */}
              {pendingRow.pet?.weightKg && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  The recorded weight of {Number(pendingRow.pet.weightKg)} kg stays as it is, so the
                  size and the weight will no longer agree.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingBand(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (pendingBand) chooseBand(pendingBand.petId, pendingBand.band);
                setPendingBand(null);
                setEditingBandFor(null);
              }}
            >
              Change size
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type AddOnCatalogueEntry = {
  id: number;
  name: string;
  priceMode: string;
  priceAud: string | null;
};

/** One row: pick an extra, give it a figure if it is quoted, add it. */
export function AddOnPicker({
  catalogue,
  onAdd,
}: {
  catalogue: AddOnCatalogueEntry[];
  onAdd: (addOn: StagedAddOn) => void;
}) {
  const [picked, setPicked] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const chosen = catalogue.find((entry) => String(entry.id) === picked);
  const needsPrice = chosen ? addOnRequiresManualPrice(chosen.priceMode) : false;
  const manual = parseFloat(manualPrice);
  const canAdd = Boolean(chosen) && (!needsPrice || (Number.isFinite(manual) && manual >= 0));

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select value={picked} onValueChange={(v) => { setPicked(v); setManualPrice(""); }}>
        <SelectTrigger className="h-7 min-w-0 flex-1 text-[11px]">
          <SelectValue placeholder="Add an extra…" />
        </SelectTrigger>
        <SelectContent>
          {catalogue.map((entry) => (
            <SelectItem key={entry.id} value={String(entry.id)}>
              <span className="flex w-full items-center justify-between gap-3">
                <span>{entry.name}</span>
                <span className="text-muted-foreground">
                  {addOnRequiresManualPrice(entry.priceMode) ? "quote" : `$${entry.priceAud ?? "0.00"}`}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsPrice && (
        <Input
          className="h-7 w-20 min-w-0 shrink text-[11px]"
          placeholder="$ amount"
          inputMode="decimal"
          value={manualPrice}
          onChange={(e) => setManualPrice(e.target.value)}
        />
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 shrink-0 gap-1 px-2 text-[11px]"
        disabled={!canAdd}
        onClick={() => {
          if (!chosen) return;
          const unitPrice = needsPrice ? manual : Number(chosen.priceAud ?? 0);
          onAdd({
            pricingServiceId: chosen.id,
            quantity: 1,
            ...(needsPrice ? { unitPrice: manual } : {}),
            name: chosen.name,
            displayPrice: unitPrice.toFixed(2),
          });
          setPicked("");
          setManualPrice("");
        }}
      >
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  );
}

export default BookingPetPricing;

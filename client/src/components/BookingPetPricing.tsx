import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dog, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { SIZE_BAND_IDS, sizeBandLabel, type DogSizeBand } from "@shared/dogSizeBand";
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
  const tier: PriceTier = context?.tier ?? "regular";

  /**
   * A band the staff member has chosen in this dialog but not yet saved.
   *
   * Kept locally so the prices update on the tap rather than after the
   * round trip, while `pets.updateSizeBand` writes it to the dog's record
   * in the background — 9,359 dogs have neither a weight nor a band, and
   * filling one in while booking is how that number comes down.
   */
  const [localBand, setLocalBand] = useState<Record<string, DogSizeBand>>({});
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
      return { petId, pet, band };
    });
  }, [petIds, context?.pets, localBand]);

  const optionsByPetId = useMemo(() => {
    const map: Record<string, PriceOption[]> = {};
    for (const row of petRows) {
      map[String(row.petId)] = groomPriceOptions({ serviceType, sizeBand: row.band, catalogue });
    }
    return map;
  }, [petRows, serviceType, catalogue]);

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
    `${service}|${petRows.map((r) => `${r.petId}:${r.band ?? ""}`).join(",")}|${catalogue.length}|${tier}`;
  const signature = signatureFor(serviceType);
  const lastSignature = useRef<string>("");

  useEffect(() => {
    if (catalogue.length === 0 || petRows.length === 0) return;
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    const next: Record<string, string> = {};
    for (const row of petRows) {
      const option = pickDefaultPriceOption(optionsByPetId[String(row.petId)] ?? [], tier);
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
      if (last.price) prices[String(row.petId)] = last.price;
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

  const quickPicks = useMemo(() => {
    // With one dog the figure is exact; with several the sizes differ, so
    // the button shows the cheapest and says "from".
    const bands = petRows.map((row) => row.band);
    return serviceQuickPicks({ sizeBand: bands.length === 1 ? bands[0] : null, tier, catalogue });
  }, [petRows, tier, catalogue]);

  const prices = petIds.map((petId) =>
    membershipCovered ? "0.00" : props.priceByPetId[String(petId)] ?? null,
  );
  const total = bookingTotal(prices);
  const addOnCatalogue = addOnCatalogueQuery.data ?? [];

  const setPrice = (petId: number, value: string) =>
    props.onPricesChange({ ...props.priceByPetId, [String(petId)]: value });

  const chooseBand = (petId: number, band: DogSizeBand) => {
    setLocalBand((current) => ({ ...current, [String(petId)]: band }));
    setBandMutation.mutate({ petId, sizeBand: band });
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
        <span className="text-sm font-semibold tabular-nums">
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
            {pick.option?.priceAud && (
              <span className="opacity-80">
                {petRows.length === 1 ? "" : "from "}
                {formatPriceAud(pick.option.priceAud)}
              </span>
            )}
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
        const staged = props.addOnsByPetId[key] ?? [];
        const last = row.pet?.last ?? null;
        const needsBand = !row.band;
        const facts = [
          row.pet?.breed,
          row.pet?.weightKg ? `${Number(row.pet.weightKg)} kg` : null,
          row.band ? sizeBandLabel(row.band) : null,
        ].filter(Boolean);

        return (
          <div key={key} className="space-y-2 rounded-md border bg-muted/20 p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{row.pet?.name ?? `Pet ${row.petId}`}</span>
              {facts.length > 0 && (
                <span className="shrink-0 truncate text-xs text-muted-foreground">{facts.join(" · ")}</span>
              )}
            </div>

            {/* 10,372 of 12,552 dogs have no recorded weight, so this is the
                normal path, not a fallback. Choosing here prices the groom
                and fills the dog's record in at the same time. */}
            {needsBand && (
              <div className="space-y-1">
                <Select value="" onValueChange={(v) => chooseBand(row.petId, v as DogSizeBand)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="No weight on file — pick a size to price it" />
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
              {!membershipCovered && options.length > 0 && (
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">From the price list</Label>
                  <Select
                    value={options.find((o) => o.priceAud === props.priceByPetId[key])?.id.toString() ?? ""}
                    onValueChange={(v) => {
                      const option = options.find((o) => String(o.id) === v);
                      if (option?.priceAud) setPrice(row.petId, option.priceAud);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a listed price" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          <span className="flex w-full items-center justify-between gap-3">
                            <span className="truncate">
                              {option.tier ? PRICE_TIER_LABELS[option.tier] : option.name}
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

            {!membershipCovered && options.length === 0 && row.band && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                The price list has no {sizeBandLabel(row.band).toLowerCase()} price for this service — enter what was agreed.
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

            <AddOnPicker
              catalogue={addOnCatalogue}
              onAdd={(addOn) => addStagedAddOn(row.petId, addOn)}
            />
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
function AddOnPicker({
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
    <div className="flex items-center gap-2">
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
          className="h-7 w-20 text-[11px]"
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

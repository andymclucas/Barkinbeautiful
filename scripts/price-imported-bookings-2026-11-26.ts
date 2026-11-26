/**
 * Suggest prices for upcoming bookings that came across from MoeGo with none.
 *
 * Lauren, 26/11/2026: "alot of dogs prices haven't come across from moego
 * for next week ... the family of 3 dogs thats where - It just bought 1
 * price over, the others will be $0". Andy: "Yes, dry run".
 *
 *   corepack pnpm exec tsx scripts/price-imported-bookings-2026-11-26.ts [--to 2027-01-31] [--out file.csv]
 *
 * DRY RUN ONLY. It reads the database and writes a CSV. It has no apply
 * mode: writing prices is a separate, deliberate step once Andy and Lauren
 * have read the list.
 *
 * Why the prices are missing: the MoeGo import scripts
 * (moego-december-2026-11-05.ts and the forward/January ones) leave price
 * NULL on purpose. MoeGo's "Total price" is the BOOKING total and often
 * reads $0, and the salon put a family's whole fee on the first dog.
 *
 * What it suggests, per booking, best evidence first:
 *
 *  1. "history": what this dog last paid for the same service, from a
 *     completed groom since 01/08/2025 (earlier MoeGo history carries
 *     expected, not collected, figures). A day where the dog's row was the
 *     only priced one of several of the client's dogs is skipped: that
 *     figure was a family total, not this dog's price.
 *  2. "catalogue": Pricing & Services at the client's tier for the dog's
 *     size. Members use their membership's tier. Everyone else is tiered
 *     by how often the dog actually comes, which is what MoeGo's tiers
 *     mean ("Diamond - Gold (up to 6wks)" = VIP, "Bronze (8wks)" =
 *     Regular, Casual = New): median gap of 6 weeks or less is VIP, 8 or
 *     less Regular, otherwise New.
 *
 * Families where ONE dog carries a figure and the others are blank: the
 * figure is kept as the family total and split across the dogs in
 * proportion to each dog's suggested price, so the family pays the same.
 *
 * Held for a person, never guessed: members' bookings (a membership groom
 * carries no price), dogs covered by a plan the booking is not linked to,
 * day care, de-sheds and anything else the catalogue prices more than one
 * way, dogs with no size, and families whose split does not resolve.
 */
import { and, eq, gte, inArray, isNotNull, lt, ne, notInArray } from "drizzle-orm";
import { readFileSync, writeFileSync } from "node:fs";
import { getDb } from "../server/db";
import { appointments, clients, membershipPets, memberships, pets, pricingServices } from "../drizzle/schema";
import { clientPriceTier, groomPriceOptions, pickDefaultPriceOption, type PriceCatalogueItem, type PriceTier } from "../shared/groomPricing";
import { bandForWeight, type DogSizeBand } from "../shared/dogSizeBand";
import { isDaycareService } from "../shared/bookingEnd";
import { dayInZone } from "../shared/calendarDay";
import { dateTimeFormat } from "../shared/intlCache";

const TZ = "Australia/Brisbane";
const args = process.argv.slice(2);
const argOf = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const toDay = argOf("--to") ?? "2027-01-31";
const out = argOf("--out") ?? "price-suggestions.csv";
const HISTORY_FROM = new Date("2025-07-31T14:00:00Z"); // 01/08/2025 Brisbane

const money = (n: number) => n.toFixed(2);
const cents = (n: number) => Math.round(n * 100);

function tierFromGapDays(gapDays: number | null): PriceTier {
  if (gapDays === null) return "new";
  if (gapDays <= 6 * 7 + 3) return "vip";
  if (gapDays <= 8 * 7 + 3) return "regular";
  return "new";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Suggestion =
  | { ok: true; price: number; basis: string; tier: PriceTier | "" }
  | { ok: false; hold: string };

async function main() {
  const db = await getDb();
  if (!db) throw new Error("No database");
  const now = new Date();
  const until = new Date(`${toDay}T14:00:00Z`); // end of that day, Brisbane

  const upcoming = await db.select({
    id: appointments.id, clientId: appointments.clientId, petId: appointments.petId,
    membershipId: appointments.membershipId, price: appointments.price,
    serviceType: appointments.serviceType, scheduledStart: appointments.scheduledStart,
    moego: appointments.moegoAppointmentId,
  }).from(appointments).where(and(
    eq(appointments.tenantId, 1), gte(appointments.scheduledStart, now), lt(appointments.scheduledStart, until),
    notInArray(appointments.workflowState, ["cancelled", "no_show"]), ne(appointments.status, "cancelled"),
  ));

  // --recheck <backup.json>: re-suggest rows this script already wrote, as
  // they were before (the backup holds their old values).
  const recheck = argOf("--recheck");
  if (recheck) {
    const before = new Map((JSON.parse(readFileSync(recheck, "utf8")) as Array<{ id: number; price: string | null }>).map((b) => [b.id, b.price]));
    for (const r of upcoming) if (before.has(r.id)) r.price = before.get(r.id) ?? null;
  }
  const petIds = Array.from(new Set(upcoming.map((r) => r.petId)));
  const clientIds = Array.from(new Set(upcoming.map((r) => r.clientId).filter((x): x is number => x !== null)));

  const petRows = petIds.length ? await db.select({ id: pets.id, name: pets.name, weightKg: pets.weightKg, sizeBand: pets.sizeBand })
    .from(pets).where(inArray(pets.id, petIds)) : [];
  const petById = new Map(petRows.map((p) => [p.id, p]));
  const clientRows = clientIds.length ? await db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName })
    .from(clients).where(inArray(clients.id, clientIds)) : [];
  const clientById = new Map(clientRows.map((c) => [c.id, c]));

  // Live plans: by the dog they are filed under and by membership_pets.
  const liveMemberships = await db.select({ id: memberships.id, petId: memberships.petId, tier: memberships.tier, isTest: memberships.isTest })
    .from(memberships).where(and(eq(memberships.tenantId, 1), inArray(memberships.status, ["active", "paused", "pending_payment"])));
  const planTierByPet = new Map<number, string>();
  for (const m of liveMemberships) if (m.petId && !m.isTest) planTierByPet.set(m.petId, m.tier ?? "");
  const liveIds = liveMemberships.filter((m) => !m.isTest).map((m) => m.id);
  if (liveIds.length) {
    const links = await db.select({ membershipId: membershipPets.membershipId, petId: membershipPets.petId })
      .from(membershipPets).where(inArray(membershipPets.membershipId, liveIds));
    const tierById = new Map(liveMemberships.map((m) => [m.id, m.tier ?? ""]));
    for (const l of links) if (!planTierByPet.has(l.petId)) planTierByPet.set(l.petId, tierById.get(l.membershipId) ?? "");
  }

  // Completed history for these dogs and their households.
  const history = petIds.length ? await db.select({
    clientId: appointments.clientId, petId: appointments.petId, serviceType: appointments.serviceType,
    price: appointments.price, scheduledStart: appointments.scheduledStart,
  }).from(appointments).where(and(
    eq(appointments.tenantId, 1), eq(appointments.workflowState, "complete"),
    isNotNull(appointments.clientId), inArray(appointments.clientId, clientIds),
  )) : [];

  const catalogue: PriceCatalogueItem[] = await db.select({
    id: pricingServices.id, name: pricingServices.name, legacyServiceType: pricingServices.legacyServiceType,
    weightBand: pricingServices.weightBand, priceMode: pricingServices.priceMode, priceAud: pricingServices.priceAud,
    sortOrder: pricingServices.sortOrder,
  }).from(pricingServices).where(and(eq(pricingServices.tenantId, 1), eq(pricingServices.catalogueType, "service"), eq(pricingServices.isActive, true)));

  // History helpers.
  const dayKey = (d: Date) => dayInZone(d, TZ) ?? "";
  const householdDay = new Map<string, typeof history>();
  for (const h of history) {
    const k = `${h.clientId}|${dayKey(h.scheduledStart)}`;
    (householdDay.get(k) ?? householdDay.set(k, []).get(k)!).push(h);
  }
  function lastPaid(petId: number, serviceType: string): { price: number; when: string } | null {
    const rows = history
      .filter((h) => h.petId === petId && h.serviceType === serviceType && h.scheduledStart >= HISTORY_FROM && Number(h.price) > 0)
      .sort((a, b) => b.scheduledStart.getTime() - a.scheduledStart.getTime());
    for (const h of rows) {
      const same = householdDay.get(`${h.clientId}|${dayKey(h.scheduledStart)}`) ?? [];
      const blankSiblings = same.filter((s) => s.petId !== petId && !(Number(s.price) > 0));
      if (blankSiblings.length > 0) continue; // a family total, not this dog's price
      return { price: Number(h.price), when: dayKey(h.scheduledStart) };
    }
    return null;
  }
  function gapDays(petId: number): number | null {
    const days = Array.from(new Set(history.filter((h) => h.petId === petId && h.scheduledStart >= HISTORY_FROM)
      .map((h) => dayKey(h.scheduledStart)))).sort();
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) gaps.push((Date.parse(days[i]) - Date.parse(days[i - 1])) / 86_400_000);
    return median(gaps);
  }

  function suggest(row: (typeof upcoming)[number]): Suggestion {
    const pet = petById.get(row.petId);
    if (!pet) return { ok: false, hold: "dog not found" };
    if (isDaycareService(row.serviceType)) return { ok: false, hold: "day care: priced by the hour" };
    const paid = lastPaid(row.petId, row.serviceType);
    const cat = catalogueFor(row, pet);
    if (paid) return { ok: true, price: paid.price, basis: `last paid ${paid.when}${cat.ok && cat.price !== paid.price ? ` (catalogue ${money(cat.price)} ${cat.tier})` : ""}`, tier: "" };
    return cat;
  }

  function catalogueFor(row: (typeof upcoming)[number], pet: NonNullable<ReturnType<typeof petById.get>>): Suggestion {
    const band: DogSizeBand | null = (pet.sizeBand as DogSizeBand | null) ?? bandForWeight(pet.weightKg);
    if (!band) return { ok: false, hold: "dog has no weight or size" };
    const planTier = planTierByPet.get(row.petId);
    const tier = planTier !== undefined ? clientPriceTier({ membershipTier: planTier }) : tierFromGapDays(gapDays(row.petId));
    const options = groomPriceOptions({ serviceType: row.serviceType, sizeBand: band, catalogue });
    const priced = options.filter((o) => !o.requiresManualPrice && o.priceAud !== null);
    const sameTier = priced.filter((o) => o.tier === tier);
    const pool = sameTier.length ? sameTier : priced.filter((o) => o.tier === null);
    const distinct = Array.from(new Set(pool.map((o) => o.priceAud)));
    if (distinct.length > 1) return { ok: false, hold: `catalogue has ${distinct.length} prices (${distinct.join(" / ")})` };
    const chosen = pickDefaultPriceOption(options, tier);
    if (!chosen || chosen.priceAud === null) return { ok: false, hold: "no catalogue price for this service and size" };
    return { ok: true, price: Number(chosen.priceAud), basis: `catalogue: ${chosen.name}`, tier };
  }

  type Line = { appt: (typeof upcoming)[number]; action: string; current: string; suggested: string; basis: string; tier: string; note: string };
  const lines: Line[] = [];

  // Group by household and day.
  const groups = new Map<string, typeof upcoming>();
  for (const r of upcoming) {
    const k = `${r.clientId}|${dayKey(r.scheduledStart)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  for (const group of groups.values()) {
    const members = group.filter((r) => r.membershipId !== null);
    const others = group.filter((r) => r.membershipId === null);
    for (const r of members) {
      if (r.price === null) lines.push({ appt: r, action: "skip", current: "", suggested: "", basis: "", tier: "", note: "member booking: no price is correct" });
    }
    const blank = others.filter((r) => r.price === null || Number(r.price) === 0);
    const priced = others.filter((r) => Number(r.price) > 0);
    if (blank.length === 0) continue;

    // A dog covered by a live plan the booking does not point at.
    const planCovered = blank.filter((r) => planTierByPet.has(r.petId));
    for (const r of planCovered) lines.push({ appt: r, action: "hold", current: r.price ?? "", suggested: "", basis: "", tier: "", note: "dog is on a membership but the booking is not linked to it" });
    const work = blank.filter((r) => !planTierByPet.has(r.petId));
    if (work.length === 0) continue;

    if (priced.length === 1 && others.length > 1) {
      // One dog carries the family total. Split it by each dog's suggestion.
      const carrier = priced[0];
      const all = [carrier, ...work];
      const sugg = all.map((r) => ({ r, s: suggest(r) }));
      const bad = sugg.find((x) => !x.s.ok);
      const total = Number(carrier.price);
      if (bad) {
        for (const { r } of sugg) if (r !== carrier) lines.push({ appt: r, action: "hold", current: r.price ?? "", suggested: "", basis: "", tier: "", note: `family total $${money(total)} on one dog; cannot split: ${(bad.s as { hold: string }).hold}` });
        continue;
      }
      const weights = sugg.map((x) => (x.s as { price: number }).price);
      const sumW = weights.reduce((a, b) => a + b, 0);
      // Whole dollars per dog: "$132.61" on a groom reads as a mistake.
      const shares = weights.map((w) => Math.floor((total * w) / sumW) * 100);
      shares[0] += cents(total) - shares.reduce((a, b) => a + b, 0); // remainder on the carrier
      sugg.forEach(({ r, s }, i) => {
        const okS = s as { price: number; basis: string; tier: PriceTier | "" };
        lines.push({
          appt: r, action: "split", current: r.price ?? "", suggested: money(shares[i] / 100),
          basis: `family total $${money(total)} split by ${okS.basis}`, tier: okS.tier,
          note: sumW > 0 && Math.abs(sumW - total) > 0.5 ? `catalogue/history for these dogs adds to $${money(sumW)}` : "",
        });
      });
      continue;
    }

    for (const r of work) {
      const s = suggest(r);
      if (s.ok) lines.push({ appt: r, action: "fill", current: r.price ?? "", suggested: money(s.price), basis: s.basis, tier: s.tier, note: priced.length > 1 ? "other dogs that day already priced" : "" });
      else lines.push({ appt: r, action: "hold", current: r.price ?? "", suggested: "", basis: "", tier: "", note: s.hold });
    }
  }

  // CSV. Client and dog names are in the file because Lauren works from it;
  // it stays on this Mac and is never committed.
  const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const header = ["date", "time", "appointment", "client", "dog", "service", "moego", "action", "current", "suggested", "tier", "basis", "note"];
  const body = lines
    .sort((a, b) => a.appt.scheduledStart.getTime() - b.appt.scheduledStart.getTime())
    .map((l) => {
      const c = l.appt.clientId ? clientById.get(l.appt.clientId) : null;
      const time = dateTimeFormat("en-AU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(l.appt.scheduledStart);
      return [dayKey(l.appt.scheduledStart), time, l.appt.id, c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "", petById.get(l.appt.petId)?.name ?? "",
        l.appt.serviceType, l.appt.moego ? "yes" : "", l.action, l.current, l.suggested, l.tier, l.basis, l.note].map(esc).join(",");
    });
  writeFileSync(out, [header.join(","), ...body].join("\n") + "\n");

  const count = (a: string) => lines.filter((l) => l.action === a).length;
  const sum = (a: string) => lines.filter((l) => l.action === a).reduce((t, l) => t + Number(l.suggested || 0), 0);
  const nextWeek = lines.filter((l) => { const d = dayKey(l.appt.scheduledStart); return d >= "2026-11-30" && d <= "2026-12-06"; });
  const byBasis = { history: lines.filter((l) => l.basis.startsWith("last paid")).length, catalogue: lines.filter((l) => l.basis.startsWith("catalogue")).length };
  const holds = new Map<string, number>();
  for (const l of lines.filter((x) => x.action === "hold")) { const k = l.note.replace(/\$[\d.]+/g, "$").replace(/\(.*\)/, "").trim(); holds.set(k, (holds.get(k) ?? 0) + 1); }
  console.log(JSON.stringify({
    window: `now to ${toDay}`, bookings: upcoming.length,
    fill: count("fill"), fillTotal: money(sum("fill")), fillBasis: byBasis,
    split: count("split"), hold: count("hold"), memberSkip: count("skip"),
    nextWeek: { fill: nextWeek.filter((l) => l.action === "fill").length, split: nextWeek.filter((l) => l.action === "split").length, hold: nextWeek.filter((l) => l.action === "hold").length },
    holds: Object.fromEntries(holds), csv: out,
  }, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

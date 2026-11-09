/**
 * Put a price on bookings that have none.
 *
 * Andy, 01/11/2026: "Add the prices for those 13 dogs." Thirteen
 * non-membership dogs on Tue 3 and Wed 4 November had no price, which
 * blocks billing at the counter: Create Bill stays disabled until every
 * dog on a booking has one.
 *
 *   corepack pnpm exec tsx scripts/price-unpriced-bookings-2026-11-01.ts
 *   corepack pnpm exec tsx scripts/price-unpriced-bookings-2026-11-01.ts --apply
 *
 * ## Where the price comes from, and where it deliberately does NOT
 *
 * It uses the app's OWN pricing functions — `groomPriceOptions` and
 * `pickDefaultPriceOption` against `pricing_services` — so each booking
 * gets exactly the figure the booking dialog would have suggested. Not
 * a second opinion written in a script.
 *
 * It does NOT use what the dog was charged last time, even though that
 * reads like the obvious source. Those figures are the MoeGo import and
 * they are demonstrably wrong: a Chihuahua at $365, a Pug at $300, a
 * Groodle at $22.95, and two Cavoodles in one household at $220 and
 * $250. This repo already carries `moego-fix-historical-inflated.ts`
 * and `moego-fix-inflated-round2.ts`, so the inflation is known.
 * Copying those forward would overcharge real clients on Tuesday.
 *
 * ## The tier, which is where the obvious answer is wrong
 *
 * `clientPriceTier` maps "no membership" to the NEW CLIENT rate. That is
 * a sound default for a walk-in and wrong for every dog here: all nine
 * clients have been coming since 2024 or 2025 — Clare De Looze 40 visits
 * since Aug 24, Mellissa Luckman 29 since Aug 24 — and the newest, Jade
 * Manteit, since August. Charging a two-year client the new-client rate
 * overcharges them $35 a groom.
 *
 * The salon's own October figures settle it. Across 172 non-member small
 * classic grooms the median was $110, which is the catalogue's VIP row to
 * the cent; styled small was $145, classic large $200, classic extra
 * large $260 — every one an exact VIP row. So VIP is what this salon
 * actually charges an established casual client, and that is what goes in
 * the box.
 *
 * Stated here rather than hidden: this OVERRIDES the tier the code would
 * pick. One constant reverses it if that is wrong.
 *
 * Anything the catalogue cannot price is LEFT ALONE and reported. A
 * blank box a groomer fills in is better than a confident wrong number.
 */
import "dotenv/config";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { appointments, pets, clients, pricingServices, memberships } from "../drizzle/schema";
import { groomPriceOptions, pickDefaultPriceOption, type PriceTier } from "@shared/groomPricing";

/** See the note above. Change to "new" to use the code's own default. */
const OBSERVED_TIER: PriceTier = "vip";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const FROM = "2026-11-03";
const TO = "2026-11-09";

(async () => {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const catalogueRows = await db
    .select({
      id: pricingServices.id,
      name: pricingServices.name,
      priceAud: pricingServices.priceAud,
      priceMode: pricingServices.priceMode,
      legacyServiceType: pricingServices.legacyServiceType,
      weightBand: pricingServices.weightBand,
      sortOrder: pricingServices.sortOrder,
      isActive: pricingServices.isActive,
    })
    .from(pricingServices)
    .where(and(eq(pricingServices.tenantId, TENANT), eq(pricingServices.isActive, true)));

  const catalogue = catalogueRows.map((r: any) => ({
    id: r.id,
    name: r.name,
    // String, because PriceCatalogueItem.priceAud is a string: the column
    // is a decimal and mysql2 hands it back as text. Converting to a number
    // here made the value disagree with its own declared type all the way
    // down into PriceOption. Harmless as it happened -- groomPricing only
    // ever passes it along and null-checks it -- but it was a lie, and the
    // `Number(...).toFixed(2)` below is unaffected either way.
    priceAud: r.priceAud === null ? null : String(r.priceAud),
    priceMode: r.priceMode,
    legacyServiceType: r.legacyServiceType,
    weightBand: r.weightBand,
    sortOrder: r.sortOrder,
  }));
  console.log(`catalogue: ${catalogue.length} active rows\n`);

  const rows: any = await db.execute(sql`
    SELECT a.id, a.service_type, a.client_id,
           DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%a %d %b %H:%i') slot,
           p.name AS pet, p.size_band, p.weight_kg,
           CONCAT(cl.first_name,' ',cl.last_name) AS client,
           (SELECT m.tier FROM memberships m
             WHERE m.client_id = a.client_id AND m.status = 'active'
             ORDER BY m.id LIMIT 1) AS membership_tier
      FROM appointments a
      LEFT JOIN pets p ON p.id = a.pet_id
      LEFT JOIN clients cl ON cl.id = a.client_id
     WHERE a.tenant_id = ${TENANT}
       AND a.status NOT IN ('cancelled','no_show')
       AND a.workflow_state NOT IN ('cancelled','no_show')
       AND (a.price IS NULL OR a.price = 0)
       AND a.membership_id IS NULL
       AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') >= ${FROM}
       AND CONVERT_TZ(a.scheduled_start,'+00:00','+10:00') <  ${TO}
     ORDER BY a.scheduled_start`);

  const targets = rows[0] as any[];
  console.log(`${targets.length} unpriced, non-membership dogs\n`);

  const planned: { id: number; price: string; line: string }[] = [];
  const skipped: string[] = [];

  for (const t of targets) {
    const tier = OBSERVED_TIER;
    const options = groomPriceOptions({
      serviceType: t.service_type,
      sizeBand: t.size_band ?? null,
      catalogue,
    });
    const chosen = pickDefaultPriceOption(options, tier);

    const who = `${t.pet} (${t.client}) ${t.slot} · ${t.service_type} · band=${t.size_band ?? "?"} · tier=${tier}`;
    /* A Tidy is priced by COAT LENGTH, not by tier — "Small" is $100 and
       "Small, short hair" is $88. That is a groomer looking at the dog,
       not something to infer from a breed name. Left for a person. */
    if (t.service_type === "fft") {
      skipped.push(`${who} — a Tidy is priced by coat length, which is a groomer's call ($88 short / $100 long)`);
      continue;
    }
    if (!chosen || chosen.priceAud === null) {
      skipped.push(`${who} — no catalogue price (${options.length} option(s) for this service/band)`);
      continue;
    }
    planned.push({
      id: t.id,
      price: Number(chosen.priceAud).toFixed(2),
      line: `${who}\n      -> $${Number(chosen.priceAud).toFixed(2)}  [${chosen.name}]`,
    });
  }

  console.log("=== would set ===");
  for (const p of planned) console.log("  " + p.line);
  if (skipped.length) {
    console.log("\n=== LEFT ALONE, needs a person ===");
    for (const s of skipped) console.log("  " + s);
  }
  console.log(`\n${planned.length} to set, ${skipped.length} left for staff`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  for (const p of planned) {
    // Guarded: only ever fills a BLANK price, never overwrites one that
    // appeared since the dry run.
    await db.update(appointments)
      .set({ price: p.price })
      .where(and(
        eq(appointments.id, p.id),
        eq(appointments.tenantId, TENANT),
        or(isNull(appointments.price), eq(appointments.price, "0.00")),
      ));
  }

  const after: any = await db.execute(sql`
    SELECT a.id, p.name AS pet, a.price
      FROM appointments a LEFT JOIN pets p ON p.id = a.pet_id
     WHERE a.id IN (${sql.join(planned.map((p) => sql`${p.id}`), sql`, `)})
     ORDER BY a.id`);
  console.log("\n=== after ===");
  for (const r of after[0] as any[]) console.log(`  ${r.pet}: $${r.price}`);
})().then(() => process.exit(0)).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});

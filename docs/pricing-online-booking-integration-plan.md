# Pricing Catalogue and Online Booking Integration Plan

## Current safe state

The `pricing_services` and `membership_plans` tables are now populated from approved Barkin Beautiful price sources. The existing online-booking capacity and appointment flows continue to use their current legacy service keys and price handling. This is intentional: no live booking price or membership charge is calculated from the new catalogue yet.

## Schema review

| Table | Purpose | Current safeguards |
|---|---|---|
| `pricing_services` | Services and add-ons by tenant, including optional legacy service keys and weight-band notes. | Unique `(tenant_id, code)` prevents duplicate imports. `price_mode` preserves fixed, range, from-price and quote-required treatments. |
| `membership_plans` | Weekly VIP plans by tenant, tier, service variant and weight band. | Unique `(tenant_id, code)` preserves the verified plan identity. Weekly billing cycle and fixed appointment interval are stored per plan. |

The new tables are not referenced by existing `appointments`, `memberships`, Stripe subscriptions or historical invoice records. This avoids accidental re-pricing of historical records.

## Phased integration

| Phase | Scope | Server-enforced behaviour | Release gate |
|---|---|---|---|
| 2A: Read-only service selection | Read active catalogue services for public online-booking UI while retaining existing legacy service keys. | The server resolves a catalogue item only by tenant and code, then confirms its legacy service key is eligible for the selected dog and groomer. | Compare selection and capacity outcomes against the current online-booking preview tests. |
| 2B: Availability and duration | Use catalogue duration only after a reviewed duration is available for every bookable service. | Capacity checks derive duration server-side, with the present legacy duration map used as a fallback until every service is approved. | Test slot availability, bath-resource capacity and large-dog rules for each mapped item. |
| 2C: Price display | Display a server-resolved indicative price treatment. Fixed prices may be displayed; range, from-price and quote-required items must retain their published qualifier. | Client input never sets price. The server returns catalogue price mode, amount and qualifier. | Human review of every public booking label and price qualifier. |
| 2D: Appointment snapshot | Store a selected catalogue code and immutable price snapshot on *new* appointments only. | A confirmed booking records the server-resolved catalogue data at booking time. Existing appointment price values are never recalculated. | Add database migration, reconciliation preview and rollback test. |
| 2E: Membership coverage | Map verified `membership_plans` to the existing controlled membership package IDs. | Membership price and appointment interval remain derived from the verified package catalogue. No automatic Stripe subscription changes. | Admin review plus Stripe reconciliation dry-run. |

## Rules that must remain in force

1. The online client must never submit an authoritative price, duration, membership tier or billing interval.
2. Quote-required and from-price services cannot be silently converted to fixed online charges.
3. Any new appointment snapshot is additive and must not mutate existing appointments, invoices, memberships or Stripe subscriptions.
4. Existing tenant, groomer service, lead-time, bath-station and large-dog capacity safeguards continue to run before a slot is offered or a booking is created.
5. New public booking behaviour requires administrator review and a separate deployment approval after focused and full regression coverage passes.

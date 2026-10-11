# Lauren's feature requests — 12/10/2026

Two batches of notes from Lauren, relayed by Andy on 12/10/2026, written up
here so they survive the chat. **This is a capture of what was asked and what
the codebase already has, not a commitment or an estimate.** Where a claim
about the code is made below it was checked on the day; where something needs
scoping before anyone gives a number, it says so.

---

## The finding that came out of writing this up

Lauren asked: *"the report shows total revenue and then 188 completed
appointments with no price not counted — do I still enter membership clients
as $0? Is the total revenue the actual correct number?"*

The first answer given in chat was that membership grooms correctly carry no
price because the weekly payment is the revenue, so excluding them is right.
**That is the intended design but it is not what the data says.** Checked on
12/10/2026:

| Measure | Count |
| --- | --- |
| Completed appointments | 6,990 |
| …with no price | 428 |
| …linked to a membership (`membership_id`) | **3** |
| …no price **and** no membership link | **428** |
| Paid rows in `membership_payments` | **0**, totalling **$0.00** |

So the offsetting revenue does not exist in Groomigo. Membership grooms are
not linked to memberships, and no membership payment has ever been recorded —
consistent with the 153 active memberships having no card on file (MoeGo's
card tokens could not be transferred, so every membership client has to
re-enter one).

**Therefore: the total revenue figure IS understating the business**, but not
because membership income is counted elsewhere in Groomigo. It is understating
because membership income is not in Groomigo at all. Until membership billing
runs here, no revenue report from this system can be reconciled against the
bank.

That makes Lauren's cash-flow request below the most load-bearing item in
either batch: she is making wage decisions on a number that cannot yet be
right.

---

## Batch 1

### 1. Waitlist for when grooming is at capacity, distinguishing new from existing
Greenfield — nothing in `shared/`, `server/`, `client/src` or `drizzle/`
mentions a waitlist. MoeGo has one (Online booking → Waitlist) worth looking
at as a reference. New-vs-existing is free: a client with no completed
appointment is new.

### 2. Separate daycare calendar, with its own staff
Half-built. `daycare` is already a `service_type` and is handled in
`shared/serviceTypes.ts`, `shared/groomerCapacity.ts`,
`shared/appointmentMembershipCoverage.ts` and
`shared/onlineBookingWeightEligibility.ts`. What is missing is a **view**, not
a data model. The calendar's staff-column selection became an *intent* rather
than a list of ids in `shared/calendarStaffSelection.ts` (12/10/2026); a
daycare view is naturally another intent over the same board.

### 3. Multi-location — several salons under one company
The largest item here and the one most likely to be mis-estimated. The schema
is multi-**tenant**: every table carries `tenantId` and queries filter on it,
so one salon = one tenant. "Several sites under one company" is a different
shape — shared clients and pets, separate calendars, staff working across
sites, reporting that rolls up. That touches the assumptions behind all 51
tables. **Needs its own scoping pass; do not quote a number from this note.**

### 4. Solo-owner tier
Mostly product and pricing rather than engineering. The pieces named already
exist: automated SMS reminders, the workflow parent portal, and the recorded
voicemail greeting (shipped 11/10/2026). The "phone receptionist" is the only
genuinely new build.

### 5. Flag an online booking that picks the wrong pricing bracket
The most actionable item in batch 1, and it is leaking money now. A customer
who books the "up to 6 weeks" price after 17 weeks should be flagged as a
casual groom, possibly with a matting fee. The inputs exist:
`server/groomInterval.ts` computes the gap, `shared/pricingCatalogue.ts` holds
the bands. Shape it as a pure function in `shared/` with unit tests, per
`CLAUDE.md` §10 — "given the last groom date and the tier chosen, is that tier
valid?" — and it can be replayed against real booking history before it ever
shows a customer anything.

---

## Batch 2

### 6. Staff book in MoeGo rather than Groomigo
Lauren's read is that staff lean towards MoeGo because it is easier, and that
the fix is automation rather than instruction. Her own next point explains
most of it: MoeGo makes the customer fill in a form, so staff do not have to.

### 7. Intake by SMS link — the detail that never gets captured
**The item most likely to change daily behaviour.** Today a booking captures
first name, last name, phone, dog's name, breed, service, date and time, and
nothing else — no email, no address, no health issues, no signed policy. The
ask: capture the basics at booking, then text the customer a link to finish
their own details and sign the policy and the under-24-hour cancellation
terms, with the signed copy kept for later reference.

Closer than it looks. `agreements`, `petPaperwork`, `clientPortal` and
`clientNotes` routers already exist (`server/routers/clientRecord.ts`), Twilio
is wired, and `server/appUrl.ts` builds the links. This is assembling existing
parts rather than new foundations — and it is the thing that would remove
MoeGo's advantage at point 6.

Consequence Lauren flagged herself: **this means a lot more outbound SMS.**
Worth costing against the provider comparison in
`moego_sms_provider_pricing_comparison.md` before switching it on, and note
`SMS_AUTOMATION_ENABLED` gates automated sending.

### 8. Membership cash flow — what lands in the bank, and when
The real pain is not reporting, it is *"will Thursday's wages clear?"*.
Specifics:

- payouts arrive about a day after collection;
- collections cluster by weekday, and Tuesday looks like the weakest day,
  which she would use to target membership sales;
- money arrives Wednesday, **wages leave Thursday**.

What she wants is a forecast: what is expected to land, on which date,
against what is going out. See the finding at the top — this cannot be built
honestly until membership billing actually runs in Groomigo, because there is
no payment data to forecast from.

### 9. Tax preparation
Gross minus 10% GST, margin, wages against expenses, weekly revenue estimates
early enough to add appointments or cut hours. Xero export was raised as an
open question — genuinely open, not yet investigated. Same dependency as
point 8: the revenue figure has to be trustworthy first.

### 10. Stock take
Salon consumables — shampoo, bandannas, bows, colognes. Lauren flagged this
herself as possibly out of scope. No existing surface.

### 11. Retail on the dog's invoice
A `retail` router already exists. The ask is that retail sales attach to the
dog's invoice rather than standing alone.

### 12. Gap between appointments, shown in brackets
Last and next appointment dates are already shown; she wants the interval too,
e.g. *(8 weeks 3 days)*, because it drives the price. **Same computation as
point 5** — `server/groomInterval.ts`. Build one and the other is nearly free,
which makes the pair a sensible first slice.

---

## If a first slice is wanted

Points **5 and 12** share a computation, are small, carry no dependency on the
membership-billing problem, and both act on pricing accuracy. Point **7** is
the larger prize and is mostly assembly. Points **8 and 9** are blocked behind
membership billing running in Groomigo at all. Point **3** needs scoping
before anyone estimates it.

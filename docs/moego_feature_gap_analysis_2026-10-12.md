# What MoeGo has that Groomigo doesn't — 12/10/2026

Written for the question "what would make this the best platform in the
world", with a cap raise in mind. It is a build list, not marketing copy:
where Groomigo already wins it says so, and where MoeGo is ahead it says that
plainly too.

## Method, and its limits

I walked MoeGo's full navigation on Barkin' Beautiful's own live account and
read each area, then checked every claimed gap against Groomigo's actual
routers, schema and shared modules rather than against memory. Where this
note says Groomigo lacks something, I grepped for it.

Two limits worth stating. I saw MoeGo as **one salon on one plan** — features
gated to other tiers, and anything a multi-location account sees, are
invisible to me. And I read screens, not their code: I can describe what a
feature does, not how well it scales.

## Where Groomigo already wins

This matters for the raise as much as the gap list, because it is the part
that cannot be caught up quickly.

- **The workflow board.** MoeGo has appointment *statuses* — Unconfirmed,
  Confirmed — and nothing resembling a 12-state floor machine with a
  `workflow_logs` audit row per transition. Groomigo knows which dog is in
  the bath, for how long, and who moved it. Nothing in MoeGo's navigation
  competes with this.
- **The Pet Tracker.** A live, client-facing view of where their dog is.
  MoeGo's equivalent is a status field staff can see.
- **Grooming cards** with before/after photos, a public share link and a
  client-portal history. MoeGo has a "grooming report" it can request reviews
  through, but not the shareable artifact.
- **Realtime push across tabs.** Every board in the salon updates the moment
  a dog moves. MoeGo polls.
- **Per-dog groomer assignment** on a multi-dog booking. MoeGo stores this
  but will not export it — the sales and schedules reports both give a
  booking-level staff list, which is why the sync needs a per-dog table.
- **Membership modelling.** Tiers, weight bands, intervals, coverage of what
  a membership includes, and ledger entries. MoeGo has memberships; it does
  not model what the groom costs when one applies.

## The gaps, in the order I would build them

### 1. Review requests — the single biggest commercial gap

**MoeGo has sent 6,418 review requests and received 2,453, averaging 4.94.**
Requests go out by SMS, on the grooming report, and through the client
portal, and every review is attributed to the groomer who did the dog.

Groomigo's `clientReviews` table stores `rating`, `comment` and a `source` of
`portal | staff_entered | imported`. **There is no request path at all** — no
SMS, no prompt on the grooming card, nothing. Reviews only exist if somebody
types one in.

This is customer acquisition, not a nice-to-have: 2,453 five-star reviews is
why a salon ranks. It is also the cheapest thing on this list to build,
because the grooming card already exists, already goes out by SMS, and
already has a share link — the prompt belongs on it.

### 2. Lapsed-client and rebook reminders — the retention engine

MoeGo runs four reminder engines. Groomigo runs one:

| | MoeGo | Groomigo |
| --- | --- | --- |
| Appointment reminder | yes | yes (4d, 2d, morning) |
| **Rebook reminder** — clients due in the next 30 days | yes | **no** |
| **Pet birthday** | yes | **no** |
| **Repeat expiry** — recurring booking needs renewing | yes | **no** |

The rebook reminder is the commercial one. Groomigo already computes the
interval between grooms (`server/groomInterval.ts`) and already knows every
client's last appointment; it simply never acts on it. A six-weekly client
who has not rebooked in nine weeks is the most valuable message a salon can
send, and nothing sends it.

### 3. Leads management — the top of the funnel

MoeGo offers a lead pipeline: capture from Google Ads, **abandoned online
bookings** and phone calls; SMS, calls and notes against each lead; Kanban
and list views; ROI tracking end to end.

Barkin' Beautiful's own online-booking page shows **59 abandoned bookings in
30 days against 51 completed — a 31% abandon rate.** Those are people who
wanted an appointment and did not get one, and Groomigo cannot currently
name a single one of them.

Groomigo has no lead concept at all. This is the largest *new* surface on the
list, and the one with the clearest investor story: it turns the product from
a system of record into a system of growth.

### 4. Waitlist

MoeGo has one on the calendar toolbar. Groomigo has nothing — zero files
mention it. Lauren asked for this directly on 12/10/2026, including
distinguishing existing clients from new ones.

### 5. Intake forms

MoeGo has a form builder with submissions, used to collect detail before a
first appointment. Groomigo has `agreements` and `petPaperwork`, which cover
signing a document but not building a form.

Lauren asked for exactly this: capture the basics at booking, then text the
client a link to finish their own details and sign the policy. Her point is
worth repeating — **staff lean towards MoeGo because MoeGo makes the customer
do the typing.**

### 6. Pet incident reporting

MoeGo has a **Pet incident report**: incident type, staff, date, description,
per pet. Groomigo has `petAlert` and `alertLevel`, which flag a dog as
difficult but do not record what happened.

This is a liability feature. A salon that cannot produce a dated incident
record when a client disputes an injury has a problem, and insurers ask.

### 7. Staff utilisation

MoeGo's staff performance report covers sales contribution, customer
satisfaction **and utilisation**. Groomigo now has revenue targets per
groomer (12/10/2026) but no utilisation at all — nothing measures booked
hours against available hours.

Utilisation is the number that tells a salon whether to hire. Revenue alone
cannot: a groomer can be at target and idle two days a week.

### 8. Cash drawer reconciliation

MoeGo counts the till by denomination, against expected takings, and records
the variance with a comment and who reconciled it. Groomigo has split
payments by method but no close-of-day.

Worth noting this is the kind of feature that is unglamorous and keeps
customers: a salon that balances its drawer in your software does not leave.

### 9. Calendar odds and ends

- **Agenda view** alongside Day/Week/Month.
- **Print** — a day sheet for the wall. Still how a lot of salons work.
- A week summary strip showing total appointments, total pets, finished,
  earned revenue and expected revenue.

## What I would not copy

- **Their exports.** The booking-level price with no per-dog split, the
  `Staffs` column that is a distinct list rather than one per pet, and the
  $0.00 totals are all traps this project has already been bitten by. If
  Groomigo ever exports, it should export per dog.
- **Reports Legacy.** They are carrying two reporting systems. We should not
  start a second one.
- **Gating leads management behind an upsell.** It is the growth engine; put
  it where every customer finds it.

## If only three get built

**Review requests, rebook reminders, and the lead pipeline.** They are the
three that make money rather than save time, and none of them requires
rebuilding anything — the grooming card, the groom interval and the
abandoned-booking data all already exist.

The workflow board is the thing that will make a demo land. These three are
what make the second year's revenue.

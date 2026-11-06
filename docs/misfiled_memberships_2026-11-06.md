# Plans filed under the wrong dog — 06/11/2026

Started from Lauren: *"effie & dusty aren't showing as membership."*
She is right about both dogs, and it is not just her clients.

## What is wrong

Scott Barker (client 39) holds **two** active Silver VIP Styled plans,
$31 and $28 a week. Both have `memberships.pet_id = 89` — **Dusty**.
Effie (pet 90) is on neither, and has no `membership_pets` row either.

The $28 plan is "Silver VIP Styled - **SML-MED (11-13kg)**". Effie is
13.00 kg, band Small-Medium (11–13 kg). It is hers.

## Why Lauren sees it on BOTH dogs

Two different mechanisms, which is why it reads as "neither of them".

- **Effie** is on no plan at all, so she gets no badge anywhere and can
  never be covered by a booking.
- **Dusty** is a plan primary, so he *does* wear the badge on his pet
  card — but the gold VIP disc on the calendar comes from
  `appointments.membership_id`, and all four of their upcoming bookings
  have it NULL. On the appointment view neither dog is marked.

## What it costs

`resolveAppointmentMembershipCoverage` needs **every** dog in a booking
covered before `fullyCovered` is true. These two are always booked
together, so Effie being uncovered means the whole booking prices —
Dusty included — while MoeGo takes $59 a week for the pair.

## It is nine clients, not one

Ten clients hold more than one active plan. **Nine of the ten have every
plan filed under the same dog.** Same shape each time: two plans at two
weight bands, both on dog #1, dog #2 on nothing.

| Client | id | Has both plans | On nothing | The two plans | Who gets the second |
|---|---|---|---|---|---|
| Carole Adams | 75 | Charlie 11.1kg | **Spencer** 7.3kg | Small(0-10) $17 · SML-MED(11-13) $22 | Small $17 → Spencer |
| Scott Barker | 39 | Dusty 20.0kg | **Effie** 13.0kg | MED $31 · SML-MED(11-13) $28 | SML-MED $28 → Effie |
| Sonia Condon | 38 | Ella 17.0kg | **Harvey** 22.0kg | LRG(17-25) $27 · MED(14-16) $24 | **ambiguous — both large** |
| Carly Herbert | 21 | Alfie 6.7kg | **Lily** 13.2kg | SML(0-10) $26 · SML-MED(11-13) $30 | SML-MED $30 → Lily |
| Lynnette Matuschka | 60 | Elle-May 9.0kg | **Jackson** 14.2kg | Small(0-10) $22 · SML-MED(11-13) $26 | SML-MED $26 → Jackson |
| Stellina Popplewell | 85 | Freddi 15.2kg | **Luna** 12.8kg | MED(14-16) $27 · SML-MED(11-13) $22 | SML-MED $22 → Luna |
| Selina Robson | 46 | Archie (no wt) | **Rocky** (no wt) | Classic Small $17 · Styled SML $22 | **ambiguous — split by service** |
| Tricia Taylor | 25 | Gracie (small) | **Lily** (sml-med) | SML-MED(11-13) $30 · SML(0-10) $26 | SML-MED $30 → Lily |
| Nicki Waldon | 28 | Chester 4.0kg | **Snickers** 5.0kg | Classic Small $22 · Styled SML $26 | **ambiguous — split by service** |

Six are decided by the weight band. Three need Andy — Condon, Robson
and Waldon, where both dogs sit in one band and the split is by service
type or not derivable at all.

**21 upcoming bookings** belong to those nine uncovered dogs. Every one
has `membership_id` NULL. The nearest are **Tue 10 Nov** — Lily
(Herbert) and Lily (Taylor). Harvey (Condon) already carries **$35.00**
on 9 Dec.

## Why nothing flagged it

`memberships.listPetAssignments` only flags a plan whose **name** claims
more dogs than are assigned — `dogsNamedInPlan` looks for "x2"/"2 x".
These are nine *single-dog* plan names. The review screen is blind to
"two one-dog plans both pointing at one dog", which is the shape the
MoeGo import actually produced.

## Why staff cannot fix it themselves

- `setCoveredPets` refuses, correctly: the plan is priced for one dog
  and ticking two makes two. Its own error says *"If the plan is filed
  under the wrong dog, change that first."*
- The **only** code path that repoints `memberships.pet_id` is
  `manageDepartedPet` (routers.ts:8716). It needs the current dog
  **departed** and the replacement in the **same weight band**. Dusty is
  alive and Large; Effie is Small-Medium. Doubly blocked.

There is no way to do this in the app.

## Also found

1. **The backfill was never applied.** Dusty is a styled-plan primary
   and both his upcoming grooms are covered by the rule, yet both are
   NULL. `scripts/backfill-appointment-memberships.ts` dry-ran on
   04/11/2026 (193 bookings) and the write never happened.
2. **`ClientDetail.tsx:799`** builds the per-dog badge from
   `m.petId` alone — no `membership_pets` — which is the exact pattern
   `shared/vipPetIds.ts` warns about. A dog covered only by assignment
   gets no badge on its pet card. `.find()` also shows one badge when a
   dog has two plans.
3. **`calendar.getClientMembershipSummary`** (routers.ts:2772) builds
   `coveredPetIds` the same wrong way. Currently harmless — the client
   only reads `suspendedPetIds` from it — but it is a loaded gun.

## What I would do

1. Decide the three ambiguous ones (Condon, Robson, Waldon).
2. One reviewed script, in a transaction, repointing nine
   `memberships.pet_id` values with a `pet_membership_events` row each.
   Andy runs it; I do not.
3. Then apply the backfill, so the 21 bookings link and the discs appear.
4. Then close the detection gap: flag a client whose active plans name
   fewer distinct dogs than there are plans.
5. Then fix the two badge reads above.

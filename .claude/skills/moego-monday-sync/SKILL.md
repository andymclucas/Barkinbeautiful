---
name: moego-monday-sync
description: The Monday MoeGo → Groomigo reconciliation for Barkin' Beautiful. Run every Monday 6am Brisbane, or whenever asked to sync, migrate or reconcile MoeGo. Covers pulling the MoeGo appointment export, producing the divergence report (what MoeGo has that Groomigo does not, and which dogs are cancelled in MoeGo but still on the Groomigo board), and — once the importer exists — applying it. Until then it reports and does not write. Encodes the data-model traps that make a naive import destructive.
---

# Monday MoeGo → Groomigo sync

Barkin' Beautiful still books in MoeGo. Groomigo is being brought up as the sole
system, and until that switch is complete the two drift apart every week —
bookings made, moved and cancelled in MoeGo that Groomigo never hears about.

This runs each Monday, over a **two-week forward window**. That window is
deliberate: small enough for a human to review row by row, wide enough to catch
the forward bookings that matter.

## Status: report by default, apply only with a human present

**There is an apply script for cancellations: `scripts/moego-apply.ts`.**

```bash
node scripts/moego-apply.ts "<export.xlsx>"          # dry run, writes nothing
node scripts/moego-apply.ts "<export.xlsx>" --apply  # cancels, in one transaction
```

It cancels dogs MoeGo has cancelled and Groomigo still shows as live, and
reports everything else. It does not create appointments.

**Creating appointments is now possible, and was done for the first time on
05/10/2026** — 11 created, plus 5 moved, 11 cancelled and 1 reinstated, all
verified afterwards with no duplicate and no pet booked twice. What changed is
the source: the **Appointment schedules** report carries a scheduled `Time`,
which the old appointment-list export did not. See Trap 1, which used to say
this was impossible and no longer does.

It is still a reviewed, hand-written script per run, not a feature. Everything
in §4 applies, and Traps 5, 9, 10 and 11 are all failure modes that only show
up once you start creating rather than cancelling.

It holds back two categories rather than guessing:

- a dog already past `scheduled` — it is at the salon, so MoeGo's cancellation
  is stale and applying it would take a dog off the board mid-groom;
- a **name collision** — MoeGo cancels "Minnie (Janene Bosa)" and Groomigo has
  "Minnie (Liz Thomas)" that day. Matching on pet and date alone cancelled the
  wrong owner's dog in testing on 30/09/2026. Matching requires pet AND client
  AND date; anything that only matches loosely is reported, never written.

**There is still no appointment importer in the app**, only hand-written
scripts per run. `migration.importClients` handles clients from a CSV and
nothing else; `moego_appointment_id` sits on the `appointments` table but no
application code reads or writes it.

**An unattended run reports and stops.** It has no MoeGo session at 6am and no
one to approve a write, so it produces the divergence report and says what it
would have done.

**An attended run may apply changes, through a reviewed script.** This was done
for the first time on 29/09/2026 and it worked, but only because every write
was guarded. Any apply step must:

- run in a **transaction** and roll back whole on any surprise;
- guard every write with `AND workflow_state = "scheduled"` and **abort when the
  affected-row count is not exactly what was expected**;
- check for an existing appointment for that pet on that date **before creating
  anything** — see Trap 5, which is how two dogs got double-booked;
- **print what it will do and be read by a person first**;
- re-verify against MoeGo immediately beforehand — see Trap 6.

Note that the write is likely to be refused when the session's permission
settings treat the production database as a shared resource. That refusal is
correct. Hand the script to the operator to run rather than looking for another
route to the same write.

The report alone is worth running weekly: it tells the salon which dogs are on
the board and are not coming.

## 1. Pull the MoeGo export

MoeGo has no API available here. The export is a browser job, so it needs
either Andy present or his Chrome session already open.

**You need TWO reports, not one.** Insights → Reports → **Appointments** lists
six; these two matter:

| Report                     | URL                                 | Gives you                                        |
| -------------------------- | ----------------------------------- | ------------------------------------------------ |
| **Appointment schedules**  | `/report/reports/appointments/1001` | every live booking, **with Date AND Time**       |
| **Cancelled appointments** | `/report/reports/appointments/1003` | the cancellations, with cancel date, who and why |

**The schedules report silently excludes cancellations.** It returns only
`Unconfirmed` and `Confirmed` rows and has no status filter. Run it alone and
you will see zero cancellations and conclude there are none — which loses the
entire urgent bucket, the one Andy reads first. On 05/10/2026 that was 11 dogs
on the board who were not coming. Always run `1003` as well.

Set the date range on each: **today → today + 14 days** (but see Trap 9 — pull
wider than you compare), entered as `DD/MM/YYYY`, then press **Run report**.

### Driving those two reports in the browser

Both pages fight automation in the same two ways. Expect them:

- **The date inputs are `readOnly` until Ant Design's panel opens**, and the
  first click after a page load frequently lands on `BODY`. Click the input,
  assert `document.activeElement` is it, and only then type. If focus did not
  take, click again — it reliably works on the second click.
- **Neither report paginates.** Every row is in the DOM at once (193 and 40
  rows respectively on 05/10/2026), so read `tbody tr` directly. Filter to rows
  with the full column count: an open date picker contributes 12 calendar rows
  to `tbody`, and there is a blank spacer row.

Getting many rows out of the page is easiest by rendering them into a `<pre>`
inside `<main>` and calling `get_page_text`. **If you hide `<main>`'s other
children to do that, restore them** — they are Andy's live session:

```js
document.getElementById("__dump")?.remove();
document.querySelectorAll("[data-__hid]").forEach(e => {
  e.style.display = "";
  delete e.dataset.__hid;
});
```

The schedules report carries 21 columns. The ones that matter:

| Column                                               | Maps to                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Booking ID`                                         | `appointments.moego_appointment_id` — the idempotency key                    |
| `Client ID`                                          | `clients.moego_client_id` — **but see Trap 10**                              |
| `Date`, `Time`                                       | the scheduled slot — **both present, see Trap 1**                            |
| `Pet name`                                           | comma-joined for multi-pet bookings — **see trap 2**                         |
| `Service & add ons`                                  | comma-joined, aligned with pets; names the weight band                       |
| `Staffs`                                             | comma-joined, aligned with pets — **see Trap 11**                            |
| `Status`                                             | Unconfirmed / Confirmed only — cancellations are **not here**                |
| `First name`, `Last name`, `Primary number`, `Email` | useful for matching a client the MoeGo id misses                             |
| `Total price`                                        | the BOOKING total, not per dog, and often `$0.00` — do not trust it as a fee |

## 2. The traps

These are why a naive import is destructive. Read them before writing any
import code.

**Trap 1 — SOLVED: use the right report and you do get a scheduled time.**
This trap used to say the export had no start time, and that is why the skill
refused to create appointments at all. It was true of the **Appointment list**
export, whose only times are `Checkin`/`Checkout` — actuals, empty for anything
not yet arrived.

It is **not** true of **Appointment schedules** (`/1001`), which carries a
`Time` column holding the scheduled slot. That report is what §1 now tells you
to pull, and creating appointments from it is sound. Eleven were created from
it on 05/10/2026.

What it still does not give you is a **duration**. Derive one, in this order:

1. an explicit duration in the service name (`"De-shed - 1 hour ..."`);
2. the **weight band named in the service text** — MoeGo spells it out
   (`SML-10kg`, `11-13kg`, `MED14-17KG`, `Medium 14-16KG`), and those map onto
   `MEMBERSHIP_WEIGHT_BANDS` in `shared/membershipPackages.ts`. Put the band
   through `getAutoDurationMinutes` in `shared/appointmentDuration.ts`;
3. the pet's recorded `weight_kg` through the same function;
4. only as a last resort, the slot of another dog on the same booking.

Step 2 matters more than it looks: on 05/10/2026 **not one** of the eleven dogs
had a weight on file, so step 3 was useless and step 4 would have been wrong —
Leo is a 60-minute classic beside Astrid's 90-minute styled, and Freddi is a
14–17 kg dog beside Luna's 11–13 kg.

**Use the parsers in `shared/moegoImport.ts`.** `parseMoegoCsv`,
`parseMoegoPets` and `phoneMatchKey` exist because hand-rolled versions of all
three corrupted an import on 30/09/2026. They are unit-tested in
`server/moegoImport.test.ts` against the exact shapes that broke. Do not write
a fresh CSV split or a pet regex — see Traps 2 and 3 for what happens.

**Trap 2 — one MoeGo row can be several Groomigo appointments.** A two-pet
booking is ONE MoeGo row with `Pet name` = `"Archie,George"`, and `Services`
and `Staffs` comma-joined in the same order. Groomigo stores one appointment
row per pet. An import must split these, and `moego_appointment_id` is then
**not unique** in Groomigo — the key is (`moego_appointment_id`, `pet_id`).
Getting this wrong either drops the second dog or double-books the first.

**Trap 3 — comma-joining is ambiguous.** A pet or service name containing a
comma cannot be split reliably. Count the split parts against each other; if
pets, services and staff do not agree, flag the row for a human instead of
guessing.

**Trap 4 — workflow state: cancel yes, anything else no.** An earlier version of
this file said workflow state must *never* be imported. That was too blunt, and
on 29/09/2026 it cost the salon a morning: the Monday run parked all 12
cancellations as "needs decision", and four cancelled dogs were still on the
board when the doors opened.

`cancelled` **is** one of the 12 workflow states, and `scheduled → cancelled` is
exactly the transition this sync exists to make. The real rule:

- **Only ever act on a row still at `scheduled`.** Guard every write with
  `AND workflow_state = "scheduled"` and abort when the affected-row count does
  not match. A dog past `scheduled` is on the floor and is untouchable.
- **Set both columns.** `appointments` carries `workflow_state` (the 12-state
  machine) *and* `status` (`confirmed|pending|cancelled|no_show`). Setting one
  and not the other leaves the row inconsistent.
- **Write the audit row.** Insert into `workflow_logs` (`from_state`,
  `to_state`, and a note naming the sync). That trail drives the Pet Tracker and
  the timing analytics.
- Everything else stands: MoeGo wins on scheduling facts, Groomigo wins on any
  state past `scheduled`.

A direct SQL write runs no application code, so it enqueues no reminders — the
safe path for a cancellation. Confirm `SMS_AUTOMATION_ENABLED` first regardless.

**Trap 5 — match on (pet, date), never on the booking id alone.** On 29/09/2026
a dedupe guard of `WHERE pet_id = ? AND moego_appointment_id = ?` failed twice in
one run, because `moego_appointment_id` is neither reliably present nor the whole
key:

- Rows created in Groomigo carry a **NULL** booking id, so the guard could not
  see them and **duplicated two dogs onto a live board**.
- The guard did not filter on state, so it matched a **cancelled** row, reported
  "already exists", and skipped a dog who was in fact arriving that morning.

Before creating anything, look for an existing appointment for that pet on that
date **whatever its booking id or workflow state**, and decide from what you
find. Duplicating a dog is the single worst outcome of this sync — staff work
from that board.

**And search the booking id across ALL dates, not just the window.** On
05/10/2026 Teddy (Kirstine Price) looked like a missing booking. Booking
`124259135` was in fact already in Groomigo — **cancelled, on 02/10**, a past
date outside the window, so the windowed comparison could not see it. MoeGo had
rescheduled that same id to 13/10 and did **not** list it as cancelled.

Inserting would have given one `(booking id, pet)` two rows and broken the key
the whole sync matches on; every later comparison would then see two rows for
one MoeGo booking. The right move was to **move and reinstate the existing
row**, writing `cancelled -> scheduled` to `workflow_logs` rather than quietly
rewriting history.

That is a `cancelled -> scheduled` transition, which Trap 4's "only ever act on
a row still at `scheduled`" forbids. That rule exists to protect dogs on the
salon floor; it does not fit a cancelled row in the past that MoeGo has
revived. Reinstating is correct there, but assert every one of: MoeGo does not
list the booking as cancelled; MoeGo's live schedule has it on the new date;
Groomigo holds exactly one row for it, cancelled, for the right pet and client;
and the pet has nothing else that day.

**Trap 6 — a Monday-only sync is stale before it runs.** On 29/09 a booking was
cancelled in MoeGo at 19:17 the night before and was invisible to that morning's
export; another was cancelled while the reconciliation was still running. Re-pull
MoeGo immediately before applying anything, and never apply from a file pulled
earlier in the session.

**Trap 7 — absence is not deletion.** A Groomigo appointment missing from the
MoeGo export has not been cancelled — it may have been booked in Groomigo.
Never delete on absence. Flag it.

**Trap 8 — no client messages.** Imported appointments must not enqueue
reminders. Confirm `SMS_AUTOMATION_ENABLED` is off before any write step, and
that the import path does not touch the reminder columns. Real clients, real
phones, and a reminder storm cannot be recalled.

**Trap 9 — a reschedule OUT of the window looks exactly like a deletion.** On
05/10/2026 Polo (Kathryn Arnold) sat in bucket 3 — on the Groomigo board,
absent from MoeGo — with no cancellation anywhere. He had simply been moved
from Thu 15/10 to **Wed 21/10**, two days past the end of a 14-day window. The
booking id was unchanged; it was just outside the dates being compared.

Nothing in the comparison can tell that apart from a deleted booking, because
in both cases the booking id is in Groomigo and not in the pull. This is the
hidden half of Trap 7, and it is why "never delete on absence" is not merely
cautious: Polo is a six-weekly client with his next three grooms booked, and
deleting on absence would have wiped a live customer off the board.

Two cheap mitigations, both proven that morning:

- **Pull wider than you compare.** Pull MoeGo over ~21 days and compare 14. A
  short reschedule then resolves itself into bucket 4 instead of masquerading
  as a deletion.
- **For anything in bucket 3, open the client's record in MoeGo and look the
  booking id up there** before calling it unexplained. The client page shows
  `Upcoming / History / Cancelled / No-show` counts and every booking id, which
  settles it in one page view. Kathryn Arnold read `Cancelled (0)`, and booking
  `#132404851` was sitting in her upcoming list on the new date.

**Trap 10 — a client can be in Groomigo with a NULL `moego_client_id`.** On
05/10/2026 Dolly's owner was reported as "does not exist in Groomigo, needs a
client import" on the strength of
`WHERE moego_client_id = '105203376'` returning nothing. **Lisa Kelso was
already there**, client `#270010`, with Dolly already on file — her
`moego_client_id` was simply NULL, because she was created in Groomigo rather
than imported.

Creating her would have produced a duplicate client, a duplicate pet and a
duplicate grooming history for a real customer. Before concluding a client is
missing, match in this order: `moego_client_id`, then **phone** via
`phoneMatchKey` from `shared/moegoImport.ts` (last 9 digits — Australian
numbers lose their leading zero constantly), then **email**. Only when all
three miss is the client genuinely new.

When you match by phone or email, **backfill `moego_client_id`** so the next
sync matches by id. Guard it with `AND moego_client_id IS NULL`.

**Trap 11 — the `Staffs` column needs an alias table, and Groomigo may be
stale.** MoeGo's **"Megan Graham"** is Groomigo's **"Megs Graham"**. Neither
string contains the other, so a substring match misses it and the dog gets
filed under nobody. Keep an explicit alias map and **abort on any name that
does not resolve** rather than inserting a staff-less appointment.

Align `Staffs` with `Pet name` by position, and when MoeGo lists one staff for
several pets, that one does all of them. But do not use the dog Groomigo
already holds to validate the alignment: on 05/10/2026 four of eight bookings
had a Groomigo groomer that disagreed with MoeGo's current assignment, because
MoeGo had been changed since the import. MoeGo wins on scheduling facts — use
its current value for the new row, leave the existing row alone, and say so in
the report.

## 3. Produce the divergence report

Compare the export against the same window in Groomigo. Report, do not write:

```bash
# Groomigo's view of the same fortnight
node -e '
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");
(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } });
  const [rows] = await c.query(`
    SELECT moego_appointment_id, pet_id, workflow_state,
           DATE(CONVERT_TZ(scheduled_start,"+00:00","+10:00")) AS d
    FROM appointments
    WHERE DATE(CONVERT_TZ(scheduled_start,"+00:00","+10:00"))
          BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)`);
  console.log(JSON.stringify(rows));
  await c.end();
})();'
```

The four buckets to report:

1. **Cancelled in MoeGo, still live in Groomigo** — the urgent one. These dogs
   are on the board and are not coming.
2. **In MoeGo, absent from Groomigo** — new or rescheduled bookings.
3. **In Groomigo, absent from MoeGo** — booked in Groomigo, deleted in MoeGo,
   **or rescheduled just outside the window (Trap 9)**. Never auto-delete.
   Resolve each one against the client's MoeGo record before reporting it as
   unexplained.
4. **Present in both, fields differ** — date, service or staff changed.

Give counts first, then the rows. For a fortnight this is a few hundred rows,
which a person can actually read.

**Compare per DOG, not per booking.** One MoeGo row is several Groomigo rows
(Trap 2), so expand MoeGo's `Pet name` before matching or the counts will never
agree: on 05/10/2026 MoeGo's 193 bookings were 242 dogs, against Groomigo's 242
appointments. The match key is `(Booking ID, normalised pet name)`.

Sanity-check the result both ways before trusting it. Every genuine difference
that morning fell into the four buckets, and two apparent ones turned out to be
artefacts: Teddy (Trap 5) and Polo (Trap 9).

## 4. Applying

Until an importer exists this is a reviewed script, written fresh each time and
run by the operator. Shape it like the one that worked on 29/09/2026:

- **Dry run first, always.** Print the buckets and stop until approved.
- **Match on (`pet_id`, date)**, not on `moego_appointment_id` — it is NULL on
  anything booked in Groomigo, and a cancelled row is still a row. See Trap 5.
- **Transaction, with count assertions.** Expect exactly N updates; abort and
  roll back on anything else.
- **Guard on `workflow_state = "scheduled"`** on every write, and report what
  was skipped rather than forcing it.
- **Write `workflow_logs`** for every state change.
- **Re-verify against MoeGo immediately before running.** See Trap 6.
- **Leave `price` NULL on a created sibling dog.** The booking's fee already
  sits on the first dog's row; copying it inflates revenue.
- **Never invent a pet, and check hard before believing one is missing.** If
  MoeGo names a dog Groomigo has no record of, report it and stop. On 29/09
  that was Cookie (Trish Armstrong) — genuinely absent. On 05/10 Dolly looked
  absent and was not: see Trap 10.

### Creating appointments

Everything above still applies. In addition:

- **Derive each field per dog from MoeGo**, not by cloning the dog already on
  the booking. Service, groomer and duration all routinely differ between two
  dogs of one booking. Only the **start time** is shared — in every correctly
  imported multi-pet booking in the window, every dog shares one start.
- **Duration** by the ladder in Trap 1.
- **`price` and `gross_price` NULL.** MoeGo's `Total price` is the booking
  total, not the dog's, and frequently reads `$0.00`.
- **`workflow_state = "scheduled"`, `status = "pending"`**, matching every
  other imported row. Leave `reminder_*` NULL: they are real upcoming
  appointments and should behave like any other.
- **Abort rather than guess** on an unresolved groomer (Trap 11), an
  unclassifiable service, or pet/service/staff counts that disagree (Trap 3).
- **Assert the post-conditions inside the transaction**: each booking holds
  exactly the number of rows it should, and each created dog has exactly one
  appointment that day. Then re-run the divergence report afterwards and
  confirm no pet is booked twice anywhere in the window.

### When the write is refused

The session's permission settings may treat the production database as a
shared resource and refuse the write. **That refusal is correct.** Hand the
script to Andy to run rather than looking for another route to the same write,
and tell him plainly what it does and what it asserts.

When the importer is finally built, put the reconciliation rules in `shared/` as
pure functions with unit tests, per the project convention — not inline in a
router.

## 5. Report back

State plainly: the window covered, the bucket counts, anything skipped or
flagged for a human, and whether anything was written. If nothing was written,
say so in as many words.

Andy reads this on a Monday morning before the salon opens. Lead with the
number of dogs on the board that are not coming.

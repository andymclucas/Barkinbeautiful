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
reports everything else. It will **not** create missing appointments: the
appointment-list export has `Appointment date` and no start time (only
`Created time`, which is when the booking was made), so creating from it means
inventing a slot on a real groomer's day. Those rows are printed for a human.

It holds back two categories rather than guessing:

- a dog already past `scheduled` — it is at the salon, so MoeGo's cancellation
  is stale and applying it would take a dog off the board mid-groom;
- a **name collision** — MoeGo cancels "Minnie (Janene Bosa)" and Groomigo has
  "Minnie (Liz Thomas)" that day. Matching on pet and date alone cancelled the
  wrong owner's dog in testing on 30/09/2026. Matching requires pet AND client
  AND date; anything that only matches loosely is reported, never written.

**There is still no appointment importer.** `migration.importClients` handles
clients from a CSV and nothing else; `moego_appointment_id` sits on the
`appointments` table but no application code reads or writes it.

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

1. **Insights → Reports → Appointment list report** (`go.moego.pet`).
2. Set the date range: **today → today + 14 days**, entered as `DD/MM/YYYY`.
3. Press **Download**. It exports every column currently selected.

The report carries 24 columns. The ones that matter:

| Column | Maps to |
| --- | --- |
| `Booking ID` | `appointments.moego_appointment_id` — the idempotency key |
| `Client ID` | `clients.moego_client_id` |
| `Appointment date` | the date only — **see trap 1** |
| `Pet name` | comma-joined for multi-pet bookings — **see trap 2** |
| `Services`, `Add-ons` | comma-joined, aligned with pets |
| `Staffs` | comma-joined, aligned with pets |
| `Status` | Unconfirmed / Confirmed / Ready / Checked in / Finished / Cancelled / No-show |
| `Source` | `Online booking` or `Created by staff` |
| `Checkin datetime`, `Checkout datetime` | actuals, not the schedule |

## 2. The traps

These are why a naive import is destructive. Read them before writing any
import code.

**Trap 1 — the export has no scheduled time.** `Appointment date` is a date.
The only times are `Checkin`/`Checkout`, which are actuals and empty for
anything not yet arrived. Groomigo's `scheduled_start` is a timestamp. **The
export alone cannot populate a start time.** Either pull times from the
calendar view as well, or treat time as a field the import never touches on
existing rows — and refuse to create new rows without one.

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
3. **In Groomigo, absent from MoeGo** — either booked in Groomigo, or deleted
   in MoeGo. Never auto-delete; flag.
4. **Present in both, fields differ** — date, service or staff changed.

Give counts first, then the rows. For a fortnight this is a few hundred rows,
which a person can actually read.

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
- **Never invent a pet.** If MoeGo names a dog Groomigo has no record of, report
  it and stop. On 29/09 that was Cookie (Trish Armstrong).

When the importer is finally built, put the reconciliation rules in `shared/` as
pure functions with unit tests, per the project convention — not inline in a
router.

## 5. Report back

State plainly: the window covered, the bucket counts, anything skipped or
flagged for a human, and whether anything was written. If nothing was written,
say so in as many words.

Andy reads this on a Monday morning before the salon opens. Lead with the
number of dogs on the board that are not coming.

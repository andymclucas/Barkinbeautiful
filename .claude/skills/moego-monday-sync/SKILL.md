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

## Status: reporting only

**There is no appointment importer yet.** `migration.importClients` handles
clients from a CSV and nothing else; `moego_appointment_id` exists on the
`appointments` table but no code reads or writes it. Until the importer is
built, this skill **produces the divergence report and stops**. Do not attempt
to write appointment changes by hand-rolled SQL — see the traps below for why.

The report on its own is worth running: it tells the salon which dogs are on
the Groomigo board that are not coming.

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

**Trap 4 — workflow state must never be imported.** Groomigo's workflow state
is the live floor state, and `workflow_logs` is the audit trail the timing
analytics run on. A dog mid-bath cannot be reset by an import. MoeGo wins on
scheduling facts (date, service, staff, cancellation); **Groomigo always wins
on workflow state.**

**Trap 5 — absence is not deletion.** A Groomigo appointment missing from the
MoeGo export has not been cancelled — it may have been booked in Groomigo.
Never delete on absence. Flag it.

**Trap 6 — no client messages.** Imported appointments must not enqueue
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

## 4. Applying (once the importer exists)

Not yet built. When it is:

- Dry run first, always. Print the four buckets and stop until approved.
- Match on (`moego_appointment_id`, `pet_id`). Update in place. Never
  blind-insert.
- Put the reconciliation rules in `shared/` as pure functions with unit tests,
  per the project convention — not inline in a router.
- Record what was applied, so a bad run can be reasoned about afterwards.

## 5. Report back

State plainly: the window covered, the four bucket counts, anything flagged for
a human, and — while this is reporting-only — that nothing was written.

Andy reads this on a Monday morning before the salon opens. Lead with the
number of dogs on the board that are not coming.

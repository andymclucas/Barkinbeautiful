---
name: db-migration
description: Safely change the Drizzle schema and hand-write a migration for Barkin' Beautiful's live MySQL/TiDB database. Use when adding or altering a table, column, index or enum value. drizzle-kit generate is broken in this repo and db:push must never be run; migrations are written by hand. Covers why an added column must be migrated BEFORE the code merges even when nullable, and the __drizzle_migrations ledger check that stops migrate replaying migrations already applied.
---

# Changing the database

The database holds a real salon's clients, pets, appointments and financial
ledger. Two rules govern everything here:

1. **Applying a migration is the operator's decision.** You do **not** run
   `drizzle-kit migrate`, `db:push` or `drizzle-kit push` against any real
   database. `.claude/settings.json` denies these commands.

   **`drizzle-kit generate` is broken in this repo — do not run it either.**
   The snapshot chain stops at `0043`, so it re-emits ten migrations' worth of
   already-applied DDL. Write the `.sql` by hand and add a `_journal.json`
   entry instead; `0044`–`0055` are the pattern. Migration files live in
   `drizzle/`, NOT `drizzle/migrations/`, which holds only a `.gitkeep`.

2. **Deploy ordering is the top risk.** Render auto-deploys `main`; migrations run
   separately. Code and schema are therefore never in lockstep. Commit `b848737`
   is a production hotfix titled *"remove reference to not-yet-migrated
   `moego_pet_codes` column"* — code shipped that queried a column the database
   did not have.

## Procedure

### 1. Understand what exists

`drizzle/schema.ts` defines 39 tables. Read the actual table before changing it —
do not assume a column's name, type or nullability.

```bash
grep -n "mysqlTable" drizzle/schema.ts        # all tables and their line numbers
```

Note whether the table carries `tenantId`. Most do, and this app is multi-tenant:
new tenant-scoped tables need one, plus an index leading with it.

### 2. Migrate first. Nullable does NOT make a column order-independent

This was wrong in an earlier version of this file and nearly shipped a change
that would have stopped the salon floor.

Drizzle names **every column declared in `schema.ts`** in every bare `select()`
and every `insert()`. The column does not have to be referenced anywhere in
your code — declaring it is enough for the app to ask the database for it.
Verified against drizzle-orm 0.44.6: a bare select on `appointments` emits the
new column in its column list.

So for an added column, **apply the migration before the code reaches `main`**.
Code-first fails every bare select and insert on that table with "Unknown
column" — for `appointments` that is `requireApprovedStaffAppointmentAccess`
(17 procedures), `updateWorkflowState` and all 8 insert sites.

- **Adding a column:** nullable, or with a default, and **migration first**.
  Nullability is what keeps the OLD code working during the gap, not what makes
  the order free. Enforce `NOT NULL` in a *later* migration once backfilled.
- **Removing a column:** stop reading it in code and deploy that first. Drop the
  column in a later release.
- **Renaming:** add the new column, write both, migrate readers, then drop the old
  one. Never a single rename on a populated table.

A `NOT NULL` column with no default **fails outright** on a non-empty table.

### 3. Edit the schema, then hand-write the migration

`generate` is unusable here (rule 1), so write both halves yourself:

1. `drizzle/00NN_short_description.sql` — the DDL, with a comment saying why.
   Put several `ADD COLUMN`s in **one** `ALTER`. MySQL/TiDB DDL is not
   transactional, so separate statements can leave the first applied, the
   migration unrecorded, and a re-run failing on "Duplicate column name".
2. A `_journal.json` entry: `idx` (next in sequence), `"version": "5"`, `when`
   (epoch ms, greater than the previous entry), `tag` (the filename without
   `.sql`), `"breakpoints": true`. Keep the file's trailing newline.

The `.sql` is what will actually run. Read it as if someone else wrote it.

Never hand-edit a migration that has already been applied anywhere. Environments
that ran it will never see the edit, so they drift permanently. Generate a new
migration instead.

### 4. Enum changes need extra care

`appointments.workflowState` has 12 values, and `workflowLogs` repeats the same
list twice (`fromState`, `toState`). Change one, change all three.

Adding a value means auditing every `switch`, map and exhaustive check over it,
client included, or the UI silently renders nothing. Removing or renaming a value
is a **data migration** — existing rows already hold it.

### 5. Review before proposing to apply

Run the `schema-guardian` agent on the change. It checks destructive operations,
ordering hazards, missing `tenantId`, indexes and audit-table integrity.

Then verify the code still compiles and the suite is unchanged:

```bash
corepack pnpm run check
corepack pnpm test
```

### 6. Hand over to the operator

Do not apply the migration. Report:

- **What changed**, in one or two sentences.
- **The exact SQL** that will run.
- **Required order.** For an added column this is always "migrate first, then
  merge" — see step 2.
- **Destructive operations**, each named, with the data at risk.
- **Rollback** — how to reverse it, or a plain statement that it cannot be.
  Dropping a column is DDL and cannot be rolled back; revert the code first.
- **The pre-flight they must run first.** `migrate` replays every journal entry
  newer than the newest `created_at` in `__drizzle_migrations`, and does not
  check whether the change is already present. On 30/09/2026 that table held a
  single row from 2 August while the journal had 56 entries, so `migrate` would
  have replayed 55 migrations against production and failed part way through
  with no rollback. CLAUDE.md §6 has the one-liner that prints the outstanding
  count; it must read 0.
- **The command they will run:** `corepack pnpm exec drizzle-kit migrate`
  — never `db:push`, which runs the broken `generate` first.

Commit the schema change and its generated migration **together**. A schema edit
without its migration, or a migration without the code that needs it, is how
`b848737` happened.

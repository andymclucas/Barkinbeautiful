---
name: db-migration
description: Safely change the Drizzle schema and generate a migration for Barkin' Beautiful's live MySQL/TiDB database. Use when adding or altering a table, column, index or enum value. Enforces the deploy-ordering discipline that a previous production hotfix came from, and separates generating a migration (safe) from applying one (operator's call).
---

# Changing the database

The database holds a real salon's clients, pets, appointments and financial
ledger. Two rules govern everything here:

1. **Generating a migration is safe. Applying one is not.** You may edit the
   schema and run `drizzle-kit generate`. You do **not** run `drizzle-kit
   migrate`, `db:push` or `drizzle-kit push` against any real database — that is
   the operator's decision, made deliberately. `.claude/settings.json` denies
   these commands.

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

### 2. Design for order-independence

Prefer a change that is safe whether the code or the migration lands first:

- **Adding a column:** make it nullable, or give it a default. Then code that
  deploys before the migration still runs, and code that deploys after still
  works. Enforce `NOT NULL` in a *later* migration once it is backfilled.
- **Removing a column:** stop reading it in code and deploy that first. Drop the
  column in a later release.
- **Renaming:** add the new column, write both, migrate readers, then drop the old
  one. Never a single rename on a populated table.

A `NOT NULL` column with no default **fails outright** on a non-empty table.

### 3. Edit the schema, then generate

```bash
corepack pnpm exec drizzle-kit generate
```

This writes SQL to `drizzle/migrations/` and updates `drizzle/meta/`. **Read the
generated SQL** — it is what will actually run, and it is where destructive
operations become visible.

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
- **Required order** — e.g. "apply migration first, then deploy" or "deploy code
  first, then migrate", with reasoning.
- **Destructive operations**, each named, with the data at risk.
- **Rollback** — how to reverse it, or a plain statement that it cannot be.
- **The command they will run:** `corepack pnpm run db:push`

Commit the schema change and its generated migration **together**. A schema edit
without its migration, or a migration without the code that needs it, is how
`b848737` happened.

-- One PAID payment row per Stripe invoice, enforced by the database.
--
-- Stripe emits both `invoice.paid` and `invoice.payment_succeeded` for a
-- single successful charge. The webhook checked for an existing row before
-- inserting, but check-then-insert is not atomic: on 08/10/2026 the two
-- events arrived in the same second, both handlers read "nothing booked",
-- and both inserted. One $1 charge, two payment rows and two ledger
-- entries. Revenue silently overstated, intermittently, with nothing wrong
-- on screen. The same pair on 30/09/2026 arrived far enough apart to be
-- caught, which is what makes it so easy to miss.
--
-- Why a generated column rather than a plain unique index on
-- stripe_invoice_id: FAILED rows carry an invoice id too
-- (`invoice.payment_failed` writes one), and Stripe resends that event
-- across its retry schedule, so the same invoice legitimately produces
-- several failed rows. Constraining the raw column would reject them. The
-- invariant that is actually true is "at most one PAID row per invoice", and
-- this expresses exactly that: the key is NULL for anything not paid, and
-- MySQL lets NULLs repeat freely in a unique index.
--
-- DO NOT ADD paid_invoice_key TO drizzle/schema.ts. Drizzle names every
-- declared column in every insert(), and MySQL rejects an insert that names
-- a generated column. Leaving it out of the schema means the app never
-- mentions it while the database still enforces it.
--
-- Both statements are in ONE ALTER on purpose: MySQL/TiDB DDL is not
-- transactional, so two statements can leave the first applied, the
-- migration unrecorded, and a re-run failing on "Duplicate column name".
--
-- This will FAIL if duplicates already exist. Run
-- scripts/dedupe-membership-payments.ts --apply first.
ALTER TABLE `membership_payments`
  ADD COLUMN `paid_invoice_key` VARCHAR(255)
    GENERATED ALWAYS AS (CASE WHEN `status` = 'paid' THEN `stripe_invoice_id` END) STORED,
  ADD UNIQUE INDEX `uniq_membership_payments_paid_invoice` (`paid_invoice_key`);

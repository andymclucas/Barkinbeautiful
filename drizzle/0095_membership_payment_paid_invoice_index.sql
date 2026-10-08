-- The index half. Requires 0094 to have added the column.
--
-- This is what actually stops one Stripe charge being booked twice: two
-- simultaneous webhook handlers both insert, and the second collides on
-- this key rather than quietly creating a second payment row. The webhook
-- treats a duplicate-key error as "already booked".
--
-- NULLs repeat freely in a MySQL/TiDB unique index, so rows that booked no
-- Stripe invoice — manual charges, and every failed row — are unaffected.
--
-- FAILS if duplicates exist. scripts/dedupe-membership-payments.ts --apply
-- clears them and reports what it removed.
ALTER TABLE `membership_payments`
  ADD UNIQUE INDEX `uniq_membership_payments_paid_invoice` (`paid_invoice_key`);

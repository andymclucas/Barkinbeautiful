-- Memberships can bill monthly as well as weekly.
--
-- Weekly stays the default and the stored `price_per_cycle` stays the
-- WEEKLY rate for every membership, whatever cycle it bills on. The
-- monthly figure is derived (weekly x 52/12) by
-- shared/membershipBillingCycle.ts and never stored, so the two rates
-- cannot drift when somebody edits one of them.
--
-- NOT a reuse of `billing_cycle_weeks`: a month is 4.3333 weeks, which
-- that int column cannot express. All 153 live memberships read 1 there
-- and keep doing so.
--
-- NOT NULL with a default, so every existing row becomes 'weekly' —
-- which is what they all are — and old code that never names the column
-- carries on inserting valid rows.
ALTER TABLE `memberships`
  ADD COLUMN `billing_cycle` ENUM('weekly','monthly') NOT NULL DEFAULT 'weekly';

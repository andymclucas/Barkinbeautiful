-- Staff discounts on an appointment, with a reason.
--
-- price and gross_price already mean "collected" and "charged before
-- discounts", so the discount reuses them: gross_price holds the original,
-- price holds what the client pays. Everything downstream — the family
-- price breakdown, split bills, expected-revenue analytics — already reads
-- price, so discounts flow through without those touching.
--
-- discount_reason is nullable at the database level because a row with no
-- discount has no reason; the NOT-NULL-when-discounted rule is enforced in
-- shared/appointmentDiscount.ts, where it can produce a usable message.
--
-- All four in one ALTER: MySQL/TiDB DDL is not transactional, so separate
-- statements risk the first applying, the migration going unrecorded, and
-- a re-run failing on "Duplicate column name".
ALTER TABLE `appointments`
  ADD COLUMN `discount_percent` int NULL,
  ADD COLUMN `discount_reason` varchar(200) NULL,
  ADD COLUMN `discount_applied_by_user_id` int NULL,
  ADD COLUMN `discount_applied_at` timestamp NULL;

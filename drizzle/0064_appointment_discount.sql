-- Staff discounts on an appointment, with a reason.
--
-- pre_discount_price, NOT gross_price. gross_price already means "amount
-- CHARGED, before non-payment" for MoeGo-imported rows: 14,369 rows carry
-- it and 58 of those have gross <> price because the client did not pay in
-- full. Overloading it would have conflated "discounted" with "never
-- collected", and discounting an imported row would have overwritten price
-- with a figure nobody paid.
--
-- pre_discount_price holds what price was immediately before the discount,
-- so removing a discount restores it exactly and re-applying a different
-- percentage never compounds.
--
-- All four in one ALTER: MySQL/TiDB DDL is not transactional, so separate
-- statements risk the first applying, the migration going unrecorded, and
-- a re-run failing on "Duplicate column name".
ALTER TABLE `appointments`
  ADD COLUMN `discount_percent` int NULL,
  ADD COLUMN `discount_reason` varchar(200) NULL,
  ADD COLUMN `pre_discount_price` decimal(10,2) NULL,
  ADD COLUMN `discount_applied_by_user_id` int NULL,
  ADD COLUMN `discount_applied_at` timestamp NULL;

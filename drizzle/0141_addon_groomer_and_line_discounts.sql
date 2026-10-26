-- Add-ons: who did it, and a discount on the line.
--
-- Andy, 27/10/2026, two things on the same table:
--
--   "Add-ons need to be able to be assigned to specific groomers as
--    well. For example, Boo & Button just had to add 2 x teeth cleaning
--    and day care" — the add-on stays on the dog, but records WHO did
--    it, which need not be that dog's groomer.
--
--   "each add-on needs to be able to be discounted with either a
--    percentage or a manually entered dollar figure"
--
-- A line carries discount_percent OR discount_amount, never both —
-- enforced in shared/lineDiscount.ts, which charges full price if it
-- ever finds both rather than guessing which the client agreed to.
--
-- staff_id is NULL for "whoever has the dog", which is every existing
-- row and stays the default. No foreign key, matching appointments.
-- staff_id, so a staff member can be removed without rewriting history.
--
-- One ALTER for several ADD COLUMNs, which TiDB handles; it is only a
-- column plus an index on it that has to be split.
ALTER TABLE `appointment_add_ons`
  ADD COLUMN `staff_id` INT NULL,
  ADD COLUMN `discount_percent` DECIMAL(5,2) NULL,
  ADD COLUMN `discount_amount` DECIMAL(10,2) NULL,
  ADD COLUMN `discount_reason` VARCHAR(200) NULL;

-- What a dog is actually being charged, when the worked-out figure is wrong.
--
-- The panel computes a dog's bill from its price plus its own add-ons, which
-- is right nearly always. But a figure agreed at the counter does not always
-- decompose into a catalogue price and a list of extras — a goodwill
-- adjustment, a job that turned out to be far worse than booked, a price
-- honoured from an old quote. Staff had to reverse-engineer which component
-- to edit to make the total come out right.
--
-- Nullable with no default, so every existing row keeps computing its total
-- the way it does today and nothing is restated.
--
-- The three audit columns are not optional here: this overrides what the
-- salon's own price list says a groom costs, so who did it and why has to
-- survive. One ALTER, several ADD COLUMNs, which TiDB is happy with. No
-- index — these are read with the appointment row, never searched.
ALTER TABLE `appointments`
  ADD COLUMN `billed_total_override` DECIMAL(10,2) NULL,
  ADD COLUMN `billed_override_reason` VARCHAR(255) NULL,
  ADD COLUMN `billed_override_by_user_id` INT NULL,
  ADD COLUMN `billed_override_at` TIMESTAMP NULL;

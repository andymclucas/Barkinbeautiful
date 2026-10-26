-- A dollar discount on the whole booking, beside the existing percentage.
--
-- Andy, 27/10/2026: "plus the overall total if required".
--
-- appointments.discount_percent already exists and is restricted to
-- 5, 10, 15 or 20 — the staff-discount ladder. This is the free-figure
-- companion for "take $20 off", which that ladder cannot express.
--
-- Separate migration from 0141 only because it is a different table;
-- both are additive and nullable, so the order between them does not
-- matter.
ALTER TABLE `appointments`
  ADD COLUMN `discount_amount` DECIMAL(10,2) NULL;

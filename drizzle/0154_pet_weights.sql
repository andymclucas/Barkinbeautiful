-- Pet weight history.
--
-- `pets.weight_kg` holds one figure, overwritten on every edit, so the salon
-- can say what a dog weighs and never what it weighed. Weight feeds
-- getAutoDurationMinutes, so a dog that has grown is quietly being
-- under-booked, and an owner who sees their dog daily is the last to notice a
-- steady gain.
--
-- One row per weighing, never updated. pets.weight_kg stays the CURRENT value
-- and is written alongside, so nothing that prices or times a groom has to
-- aggregate history to answer "how big is this dog".
--
-- A new table rather than a column, so this is additive: no existing bare
-- SELECT or INSERT names it, and old code keeps working while it waits for
-- the deploy. The index is declared inline in the CREATE, which TiDB accepts
-- — the one-statement-per-migration rule in CLAUDE.md §6 is about ALTER TABLE
-- adding a column and indexing it in the same breath, which TiDB rejects.
CREATE TABLE `pet_weights` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `pet_id` INT NOT NULL,
  `weight_kg` DECIMAL(5,2) NOT NULL,
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `appointment_id` INT NULL,
  `recorded_by_user_id` INT NULL,
  `note` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_pet_weights_tenant_pet_at` (`tenant_id`, `pet_id`, `recorded_at`)
);

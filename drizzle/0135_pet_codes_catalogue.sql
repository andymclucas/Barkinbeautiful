-- The salon's own pet-code vocabulary, so it can be managed in the app.
--
-- Codes have lived as free text on pets.moego_code_labels since the MoeGo
-- import (1,384 dogs, 93 distinct codes), and what each one MEANS has lived
-- in shared/petCodeMeanings.ts — a 111-entry map somebody transcribed from
-- MoeGo's settings page by hand on 09/10/2026. That file says of itself
-- that it WILL fall behind, because the salon adds codes as it needs them
-- and only a developer could add one here.
--
-- This table is the vocabulary, not an authority: a groomer can still type
-- a code that is not in it (Andy, 22/10/2026). So nothing on pets changes
-- and no backfill of those 1,384 dogs is needed — the catalogue supplies
-- the meaning, the colour and the picker, and an unknown code still renders
-- as itself exactly as it does today.
--
-- `code` is the badge text and is what pets.moego_code_labels holds, so the
-- unique index is the join. Collation is the table default, which is
-- case-insensitive — "sensitive" and "SENSITIVE" must not become two rows.
CREATE TABLE `pet_codes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `description` VARCHAR(255),
  `colour_hex` VARCHAR(16),
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uq_pet_codes_tenant_code` (`tenant_id`, `code`),
  INDEX `idx_pet_codes_tenant_active` (`tenant_id`, `is_active`)
);

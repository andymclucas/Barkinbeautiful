-- What MoeGo calls each member of staff, per salon.
--
-- The map lived in code: three copies by 14/10/2026, two of which had
-- drifted, which is how 107 forward bookings landed on the board with
-- nobody against them. One copy fixed that for THIS salon and left two
-- problems behind.
--
-- The first is tenancy. "megan graham -> megs graham" and "bather 1 ->
-- stephanie baldwin" are Barkin' Beautiful's staff, sitting in shared
-- code. A second salon importing from MoeGo has its own names and no way
-- to express them without editing the application.
--
-- The second is renaming. The map pointed one NAME at another name, so
-- when Steph became Stephanie Baldwin on 12/10/2026 the alias target had
-- to be moved by hand or 383 bath bookings would have stopped resolving.
-- This points at a staff_id instead: rename the person and the alias
-- still finds them.
--
-- `moego_name` is stored NORMALISED — trimmed, lower case, whitespace
-- collapsed — because that is the only form the lookup ever uses, and
-- storing it raw would make the unique index miss "Bather 1" against
-- "bather  1".
--
-- No seed here. Seeding this salon's three aliases inside a migration
-- would hand every future tenant Barkin' Beautiful's staff; they go in
-- with a one-off script instead.
CREATE TABLE IF NOT EXISTS `moego_staff_aliases` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `moego_name` VARCHAR(200) NOT NULL,
  `staff_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `moego_staff_aliases_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_moego_staff_alias_name` UNIQUE(`tenant_id`, `moego_name`),
  INDEX `idx_moego_staff_alias_tenant` (`tenant_id`)
);

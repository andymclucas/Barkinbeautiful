-- The lines of a groom quote, one row per thing being charged for.
--
-- A real table rather than JSON on the quote, because "how much de-matting
-- did we sell last month" is a question this salon's owner asks, and JSON
-- makes it unanswerable.
--
-- Separate from 0155 because TiDB DDL is not transactional: two CREATE
-- TABLEs in one migration can leave the first applied, the migration
-- unrecorded, and a re-run failing on "table already exists". One statement
-- per migration means a failure is always recorded truthfully in the ledger.
CREATE TABLE `groom_quote_lines` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `quote_id` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_groom_quote_lines_quote` (`tenant_id`, `quote_id`)
);

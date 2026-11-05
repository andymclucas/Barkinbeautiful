-- Who may act in which salon.
--
-- Lauren bought The Pet Pad, live 23/11/2026, and runs it alongside Barkin'
-- Beautiful as a separate book — own clients, pets, staff, calendar, pricing
-- and subscription. So this is two tenants and a switcher, not the
-- shared-site rebuild that touches all 51 tables.
--
-- A table rather than a second column on `users`, because the relationship
-- is genuinely many-to-many: one person can own two salons, and a salon has
-- many people. It also makes the grant auditable — created_at says when
-- somebody was given another salon's data.
--
-- NOT a replacement for users.tenant_id or staff.tenant_id. Those still say
-- where a person belongs; this says where they are ALLOWED, and
-- shared/salonAccess.ts resolves one from the other. Nothing is migrated off
-- the old columns, so every existing single-salon account behaves exactly as
-- it does today whether or not it ever gets a row here.
--
-- Additive: a new table names no existing bare SELECT or INSERT, so old code
-- keeps working while it waits for the deploy. The indexes are declared
-- inline in the CREATE, which TiDB accepts — the one-statement-per-migration
-- rule in CLAUDE.md section 6 is about ALTER TABLE adding a column and
-- indexing it in the same breath, which TiDB rejects.
CREATE TABLE `salon_access` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `granted_by_user_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_salon_access_user_tenant` (`user_id`, `tenant_id`),
  INDEX `idx_salon_access_user` (`user_id`)
);

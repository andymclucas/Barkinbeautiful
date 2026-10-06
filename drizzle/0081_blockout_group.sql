-- Give a run of blockout days a single identity.
--
-- staff_blockouts stores one row per day, which is what every query that
-- reads it expects, so that stays. But "block Megs out from the 9th to
-- the 20th" is one decision by one person, and without a shared id there
-- is nothing to edit or cancel except twelve separate rows — which is
-- exactly how it has had to be done by hand.
--
-- Nullable with no default. The nine rows that already exist were each
-- created on their own and genuinely have no group, which is the truth
-- rather than a gap; they keep behaving as single days.
--
-- One statement with a drizzle breakpoint: TiDB refuses a multi-statement
-- batch and its DDL is not transactional, so the fewer statements the
-- less there is to half-apply.
ALTER TABLE `staff_blockouts` ADD COLUMN `group_id` varchar(36) NULL;
--> statement-breakpoint
CREATE INDEX `idx_blockout_group` ON `staff_blockouts` (`group_id`);
--> statement-breakpoint

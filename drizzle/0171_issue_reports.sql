-- "Report a problem" (Andy, 11/11/2026): every staff login can send a
-- report from any screen, with a screenshot, photos, the page they were on
-- and the errors that page had just thrown. Lauren and Andy work through
-- them from an owner-only inbox.
--
-- Per tenant: a report belongs to the salon whose screen it was sent from,
-- so The Pet Pad's reports never mix with Barkin' Beautiful's.
--
-- Images are NOT stored here. They go into uploaded_images like every other
-- photo, and image_keys holds their storage keys, so this row stays small
-- and well under TiDB's per-row limit however many photos are attached.
--
-- Additive: a new table names no existing bare SELECT or INSERT, so the
-- current code is unaffected. The index is declared inline in the CREATE,
-- which TiDB accepts (see 0157).
CREATE TABLE `issue_reports` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `reporter_user_id` INT NOT NULL,
  `reporter_name` VARCHAR(255) NULL,
  `message` TEXT NOT NULL,
  `page_path` VARCHAR(512) NULL,
  `page_title` VARCHAR(255) NULL,
  `context` JSON NULL,
  `recent_errors` JSON NULL,
  `image_keys` JSON NULL,
  `status` ENUM('new','in_progress','fixed','dismissed') NOT NULL DEFAULT 'new',
  `resolution_note` TEXT NULL,
  `status_changed_at` TIMESTAMP NULL,
  `status_changed_by_user_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_issue_reports_tenant_status` (`tenant_id`, `status`, `created_at`)
);

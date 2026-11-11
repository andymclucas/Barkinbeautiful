-- "Report a problem", stage 2 (Andy, 11/11/2026): automatic sorting, and
-- telling the reporter when their report has been dealt with.
--
--   category / urgency / summary / duplicate_of_id / triaged_at
--     Claude's reading of the report, written a few seconds after it is
--     sent. NULL until then, and NULL for good if triage is not configured
--     (no ANTHROPIC_API_KEY) — every reader treats NULL as "not sorted".
--   reporter_seen_at
--     When the person who sent the report last looked at its outcome in
--     their bell. A status change after this time shows as new to them.
--
-- One ALTER, all nullable, no defaults: old code never names these columns
-- and old inserts stay valid, so migration-first is safe (CLAUDE.md §6).
-- No index on duplicate_of_id: it is only ever read alongside the row.
ALTER TABLE `issue_reports`
  ADD COLUMN `category` ENUM('bug','request','question') NULL,
  ADD COLUMN `urgency` ENUM('urgent','normal','low') NULL,
  ADD COLUMN `summary` VARCHAR(200) NULL,
  ADD COLUMN `duplicate_of_id` INT NULL,
  ADD COLUMN `triaged_at` TIMESTAMP NULL,
  ADD COLUMN `reporter_seen_at` TIMESTAMP NULL;

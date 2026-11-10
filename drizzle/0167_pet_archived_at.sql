-- Who archived a dog, and when. Cleared again on restore.
--
-- Its own migration rather than part of 0166: one statement per migration
-- means a failure is always recorded truthfully in the ledger (CLAUDE.md §6).
-- Both columns nullable with no default, so existing inserts stay valid.
--
-- MIGRATE BEFORE THE CODE MERGES. Drizzle names every column declared in
-- schema.ts in every bare select and insert on `pets`.
ALTER TABLE `pets`
  ADD COLUMN `archived_at` TIMESTAMP NULL,
  ADD COLUMN `archived_by_user_id` INT NULL;

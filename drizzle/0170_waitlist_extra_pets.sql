-- The other dogs on a waitlist entry, after the first (Andy, 11/11/2026:
-- "Only one dog able to be added to the waitlist"). NULL = one dog, which
-- is every existing row, so old code reading pet_id is unaffected.
ALTER TABLE `waitlist_entries` ADD COLUMN `extra_pet_ids` JSON NULL;

-- Mark-unread and assignment, for inbound SMS and voicemails.
--
-- `read_at` stays the LIVE flag, so every existing unread badge keeps working
-- untouched. `first_read_at` is written once and never cleared, which is what
-- survives a row being marked unread again.
--
-- `assigned_staff_id` points at `staff`, not `users`: a voicemail is handed to
-- someone on the floor, who may have no login at all. No FK, matching
-- `read_by_user_id` on this table.
ALTER TABLE `missed_calls`
  ADD COLUMN `first_read_at` TIMESTAMP NULL,
  ADD COLUMN `first_read_by_user_id` INT NULL,
  ADD COLUMN `assigned_staff_id` INT NULL,
  ADD COLUMN `assigned_at` TIMESTAMP NULL,
  ADD COLUMN `assigned_by_user_id` INT NULL;

-- The same pair of ideas on inbound SMS. See 0100.
ALTER TABLE `sms_logs`
  ADD COLUMN `first_read_at` TIMESTAMP NULL,
  ADD COLUMN `first_read_by_user_id` INT NULL,
  ADD COLUMN `assigned_staff_id` INT NULL,
  ADD COLUMN `assigned_at` TIMESTAMP NULL,
  ADD COLUMN `assigned_by_user_id` INT NULL;

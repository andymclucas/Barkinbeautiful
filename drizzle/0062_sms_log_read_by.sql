-- Same accountability for inbound messages as for missed calls.
-- Separate from processed_by_user_id, which records who actioned a review,
-- not who merely opened the message.
ALTER TABLE `sms_logs` ADD COLUMN `read_by_user_id` int NULL;

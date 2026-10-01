-- Acknowledgement of a failed-payment notification.
--
-- A failed payment stays in the notifications list until the payment is
-- actually resolved; this only records that a human has seen it, so it can
-- be shown as read rather than disappearing. Both columns in one ALTER:
-- MySQL/TiDB DDL is not transactional, so splitting them risks the first
-- applying, the migration going unrecorded, and a re-run failing on
-- "Duplicate column name".
ALTER TABLE `memberships`
  ADD COLUMN `notice_read_at` timestamp NULL,
  ADD COLUMN `notice_read_by_user_id` int NULL;

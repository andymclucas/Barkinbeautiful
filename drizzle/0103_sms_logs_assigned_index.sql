ALTER TABLE `sms_logs`
  ADD INDEX `idx_sms_logs_assigned` (`tenant_id`, `assigned_staff_id`);

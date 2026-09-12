ALTER TABLE `appointments` ADD `recurring_group_id` varchar(64);
CREATE INDEX `idx_appointments_recurring_group` ON `appointments` (`recurring_group_id`);

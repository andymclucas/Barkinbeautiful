ALTER TABLE `staff_access_events` ADD `appointment_id` int;--> statement-breakpoint
ALTER TABLE `staff_access_events` ADD `workflow_from_state` varchar(32);--> statement-breakpoint
ALTER TABLE `staff_access_events` ADD `workflow_to_state` varchar(32);--> statement-breakpoint
CREATE INDEX `idx_staff_access_events_appointment` ON `staff_access_events` (`appointment_id`);
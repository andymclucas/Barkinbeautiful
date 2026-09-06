ALTER TABLE `sms_logs` ADD `review_action` enum('confirm','cancel');--> statement-breakpoint
ALTER TABLE `sms_logs` ADD `review_action` enum('confirm','cancel');--> statement-breakpoint
ALTER TABLE `sms_logs` ADD `processed_by_user_id` int;--> statement-breakpoint
ALTER TABLE `sms_logs` ADD CONSTRAINT `sms_logs_processed_by_user_id_users_id_fk` FOREIGN KEY (`processed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

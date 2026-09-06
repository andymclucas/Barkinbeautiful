ALTER TABLE `sms_logs` MODIFY COLUMN `status` enum('sent','delivered','failed','pending','received') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `sms_logs` MODIFY COLUMN `status` enum('sent','delivered','failed','pending','received') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `sms_logs` MODIFY COLUMN `type` enum('reminder','confirmation','ready_pickup','payment_failed','custom','campaign','inbound') NOT NULL DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE `sms_logs` ADD `direction` enum('outbound','inbound') DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
ALTER TABLE `sms_logs` ADD `reply_intent` enum('confirm','cancel','unknown');--> statement-breakpoint
ALTER TABLE `sms_logs` ADD `processed_at` timestamp;

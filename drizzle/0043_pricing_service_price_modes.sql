ALTER TABLE `pricing_services` MODIFY COLUMN `price_aud` decimal(10,2);--> statement-breakpoint
ALTER TABLE `pricing_services` ADD `price_mode` enum('fixed','range','from','quote') DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `pricing_services` ADD `price_max_aud` decimal(10,2);--> statement-breakpoint

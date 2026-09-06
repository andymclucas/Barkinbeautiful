CREATE TABLE `family_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL DEFAULT 1,
	`name` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `family_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `cage_number` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `tag_number` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `bath_staff_id` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `dry_staff_id` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `workflow_add_ons` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `checked_in_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `completed_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `picked_up_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `reminder_sent_at` timestamp;--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `service_type` varchar(50);--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `comb_size` varchar(20);--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `head_style` varchar(100);--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `leg_style` varchar(100);--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `warnings` text;--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `alert_level` varchar(20);--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD `preset_id` int;--> statement-breakpoint
ALTER TABLE `pets` ADD `alert_level` enum('ok','caution','danger') DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE `pets` ADD `warnings` text;--> statement-breakpoint
ALTER TABLE `pets` ADD `weight` decimal(5,2);--> statement-breakpoint
ALTER TABLE `pets` ADD `family_group_id` int;--> statement-breakpoint
ALTER TABLE `staff` ADD `address` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `date_of_birth` date;--> statement-breakpoint
ALTER TABLE `staff` ADD `emergency_contact` varchar(255);--> statement-breakpoint
ALTER TABLE `staff` ADD `emergency_phone` varchar(30);
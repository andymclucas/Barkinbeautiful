ALTER TABLE `appointments` MODIFY COLUMN `workflow_state` enum('scheduled','checked_in','bathing','drying','grooming','ready','complete','cancelled','no_show') NOT NULL DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE `appointments` ADD `stage_started_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `bathing_started_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `bathing_completed_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `drying_started_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `drying_completed_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `grooming_started_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `grooming_completed_at` bigint;--> statement-breakpoint
ALTER TABLE `appointments` ADD `ready_at` bigint;
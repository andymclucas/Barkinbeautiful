CREATE TABLE `workflow_timing_review_thresholds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`scope` enum('default','size','breed') NOT NULL,
	`scope_key` varchar(120) NOT NULL,
	`pet_size` varchar(32),
	`breed_name` varchar(100),
	`bath_minutes` int NOT NULL,
	`dry_minutes` int NOT NULL,
	`groom_minutes` int NOT NULL,
	`total_minutes` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_timing_review_thresholds_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_workflow_review_threshold_scope` UNIQUE(`tenant_id`,`scope_key`)
);
--> statement-breakpoint
ALTER TABLE `workflow_timing_review_thresholds` ADD CONSTRAINT `workflow_timing_review_thresholds_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_workflow_review_threshold_tenant` ON `workflow_timing_review_thresholds` (`tenant_id`);
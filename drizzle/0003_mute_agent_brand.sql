CREATE TABLE `staff_blockouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`staff_id` int NOT NULL,
	`blockout_date` timestamp NOT NULL,
	`start_time` varchar(5),
	`end_time` varchar(5),
	`is_full_day` boolean NOT NULL DEFAULT true,
	`reason` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_blockouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` MODIFY COLUMN `service_type` enum('classic_groom','styled_groom','bath_only','nail_trim','daycare','deshed','other') NOT NULL DEFAULT 'classic_groom';--> statement-breakpoint
ALTER TABLE `staff_blockouts` ADD CONSTRAINT `staff_blockouts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_blockouts` ADD CONSTRAINT `staff_blockouts_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_blockout_staff` ON `staff_blockouts` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_blockout_tenant_date` ON `staff_blockouts` (`tenant_id`,`blockout_date`);
CREATE TABLE `pet_membership_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`pet_id` int NOT NULL,
	`membership_id` int,
	`replacement_pet_id` int,
	`event_type` enum('pet_marked_departed','membership_removed','membership_transferred') NOT NULL,
	`note` text,
	`changed_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pet_membership_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pets` ADD `status` enum('active','departed') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `pets` ADD `departed_at` timestamp;--> statement-breakpoint
ALTER TABLE `pet_membership_events` ADD CONSTRAINT `pet_membership_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_membership_events` ADD CONSTRAINT `pet_membership_events_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_membership_events` ADD CONSTRAINT `pet_membership_events_pet_id_pets_id_fk` FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_membership_events` ADD CONSTRAINT `pet_membership_events_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_membership_events` ADD CONSTRAINT `pet_membership_events_replacement_pet_id_pets_id_fk` FOREIGN KEY (`replacement_pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_membership_events` ADD CONSTRAINT `pet_membership_events_changed_by_user_id_users_id_fk` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_pet_membership_events_pet` ON `pet_membership_events` (`pet_id`);--> statement-breakpoint
CREATE INDEX `idx_pet_membership_events_membership` ON `pet_membership_events` (`membership_id`);--> statement-breakpoint
CREATE INDEX `idx_pet_membership_events_client` ON `pet_membership_events` (`client_id`);
CREATE TABLE `staff_access_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`staff_id` int NOT NULL,
	`invitation_id` int,
	`actor_user_id` int,
	`event_type` enum('invited','accepted','approved','revoked','workflow_updated','grooming_card_uploaded') NOT NULL,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_access_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`staff_id` int NOT NULL,
	`user_id` int,
	`email` varchar(320) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`status` enum('pending','accepted','approved','revoked','expired') NOT NULL DEFAULT 'pending',
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`approved_at` timestamp,
	`invited_by_user_id` int NOT NULL,
	`approved_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_invitations_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','staff') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `staff` ADD `portal_status` enum('not_invited','invited','awaiting_approval','approved','revoked') DEFAULT 'not_invited' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_access_events` ADD CONSTRAINT `staff_access_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_access_events` ADD CONSTRAINT `staff_access_events_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_access_events` ADD CONSTRAINT `staff_access_events_invitation_id_staff_invitations_id_fk` FOREIGN KEY (`invitation_id`) REFERENCES `staff_invitations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_access_events` ADD CONSTRAINT `staff_access_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_invited_by_user_id_users_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_approved_by_user_id_users_id_fk` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_staff_access_events_staff` ON `staff_access_events` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_access_events_tenant` ON `staff_access_events` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_invitation_staff` ON `staff_invitations` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_invitation_tenant_status` ON `staff_invitations` (`tenant_id`,`status`);
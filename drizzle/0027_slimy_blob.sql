CREATE TABLE `client_portal_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`status` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
	`expires_at` timestamp NOT NULL,
	`last_accessed_at` timestamp,
	`issued_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_portal_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_portal_access_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `client_portal_access` ADD CONSTRAINT `client_portal_access_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_portal_access` ADD CONSTRAINT `client_portal_access_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_portal_access` ADD CONSTRAINT `client_portal_access_issued_by_user_id_users_id_fk` FOREIGN KEY (`issued_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_client_portal_access_client` ON `client_portal_access` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_client_portal_access_tenant_status` ON `client_portal_access` (`tenant_id`,`status`);
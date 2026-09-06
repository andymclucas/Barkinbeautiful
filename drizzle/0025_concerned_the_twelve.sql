CREATE TABLE `stripe_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripe_event_id` varchar(255) NOT NULL,
	`event_type` varchar(120) NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int,
	`membership_id` int,
	`invoice_id` int,
	`processed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_events_stripe_event_id_unique` UNIQUE(`stripe_event_id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `stripe_checkout_session_id` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `stripe_checkout_url` text;--> statement-breakpoint
ALTER TABLE `stripe_events` ADD CONSTRAINT `stripe_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stripe_events` ADD CONSTRAINT `stripe_events_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stripe_events` ADD CONSTRAINT `stripe_events_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stripe_events` ADD CONSTRAINT `stripe_events_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_stripe_events_tenant` ON `stripe_events` (`tenant_id`);
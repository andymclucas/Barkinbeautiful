CREATE TABLE `membership_ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`membership_id` int NOT NULL,
	`appointment_id` int,
	`invoice_id` int,
	`entry_type` enum('payment','groom_value','credit_adjustment','debit_adjustment') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`source` enum('stripe','moego_import','manual','system') NOT NULL DEFAULT 'manual',
	`external_reference` varchar(255),
	`note` text,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `membership_ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `membership_id` int;--> statement-breakpoint
ALTER TABLE `membership_ledger_entries` ADD CONSTRAINT `membership_ledger_entries_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_ledger_entries` ADD CONSTRAINT `membership_ledger_entries_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_ledger_entries` ADD CONSTRAINT `membership_ledger_entries_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_ledger_entries` ADD CONSTRAINT `membership_ledger_entries_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_ledger_entries` ADD CONSTRAINT `membership_ledger_entries_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_membership_ledger_membership` ON `membership_ledger_entries` (`membership_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_ledger_tenant_date` ON `membership_ledger_entries` (`tenant_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_membership_ledger_invoice` ON `membership_ledger_entries` (`invoice_id`);--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;
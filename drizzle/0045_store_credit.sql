CREATE TABLE `store_credit_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`type` enum('credit_added','appointment_deduction','refund','adjustment') NOT NULL,
	`method` varchar(50),
	`appointment_id` int,
	`note` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `store_credit_transactions_id` PRIMARY KEY(`id`)
);

ALTER TABLE `store_credit_transactions` ADD CONSTRAINT `store_credit_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `store_credit_transactions` ADD CONSTRAINT `store_credit_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `store_credit_transactions` ADD CONSTRAINT `store_credit_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `store_credit_transactions` ADD CONSTRAINT `store_credit_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
CREATE INDEX `idx_store_credit_tenant_client` ON `store_credit_transactions` (`tenant_id`,`client_id`);

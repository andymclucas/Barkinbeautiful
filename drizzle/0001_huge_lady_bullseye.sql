CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`pet_id` int NOT NULL,
	`staff_id` int,
	`service_type` enum('classic_groom','styled_groom','bath_only','nail_trim','daycare','other') NOT NULL DEFAULT 'classic_groom',
	`scheduled_start` timestamp NOT NULL,
	`scheduled_end` timestamp NOT NULL,
	`actual_start` timestamp,
	`actual_end` timestamp,
	`workflow_state` enum('scheduled','checked_in','bathing','grooming','ready','complete','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`tracker_token` varchar(64),
	`tracker_sms_sent` boolean NOT NULL DEFAULT false,
	`estimated_pickup_at` timestamp,
	`notes` text,
	`membership_id` int,
	`price` decimal(10,2),
	`status` enum('confirmed','pending','cancelled','no_show') NOT NULL DEFAULT 'confirmed',
	`moego_appointment_id` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointments_tracker_token_unique` UNIQUE(`tracker_token`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`address` text,
	`notes` text,
	`status` enum('active','inactive','lapsed','blocked') NOT NULL DEFAULT 'active',
	`referral_source` varchar(100),
	`portal_password_hash` text,
	`moego_client_id` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`quantity` decimal(8,2) NOT NULL DEFAULT '1',
	`unit_price` decimal(10,2) NOT NULL,
	`line_total` decimal(10,2) NOT NULL,
	`product_id` int,
	CONSTRAINT `invoice_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`appointment_id` int,
	`invoice_number` varchar(50) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`tax_amount` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL,
	`status` enum('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`payment_method` enum('square','stripe','cash','eftpos','bank_transfer'),
	`paid_at` timestamp,
	`due_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`membership_id` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`status` enum('paid','failed','refunded','pending') NOT NULL DEFAULT 'pending',
	`gateway_payment_id` varchar(255),
	`failure_reason` text,
	`paid_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `membership_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`pet_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`tier` enum('diamond','platinum','gold','silver','bronze') NOT NULL,
	`service_type` enum('classic','styled') NOT NULL DEFAULT 'classic',
	`billing_cycle_weeks` int NOT NULL DEFAULT 1,
	`price_per_cycle` decimal(10,2) NOT NULL,
	`status` enum('active','paused','cancelled','pending_payment','expired') NOT NULL DEFAULT 'active',
	`payment_gateway` enum('square','stripe','cash','other') NOT NULL DEFAULT 'square',
	`gateway_subscription_id` varchar(255),
	`next_billing_date` timestamp,
	`failed_payment_count` int NOT NULL DEFAULT 0,
	`last_failed_payment_at` timestamp,
	`booking_suspended` boolean NOT NULL DEFAULT false,
	`moego_membership_id` varchar(100),
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`cancelled_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `migration_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`type` enum('csv_import','moego_extract') NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`total_records` int NOT NULL DEFAULT 0,
	`processed_records` int NOT NULL DEFAULT 0,
	`error_count` int NOT NULL DEFAULT 0,
	`error_log` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `migration_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pet_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`pet_id` int NOT NULL,
	`appointment_id` int,
	`url` text NOT NULL,
	`caption` text,
	`taken_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pet_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`species` enum('dog','cat','other') NOT NULL DEFAULT 'dog',
	`breed` varchar(100),
	`weight_kg` decimal(5,2),
	`coat_type` varchar(100),
	`colour` varchar(100),
	`date_of_birth` timestamp,
	`gender` enum('male','female','unknown') NOT NULL DEFAULT 'unknown',
	`desexed` boolean NOT NULL DEFAULT false,
	`vaccine_expiry` timestamp,
	`behaviour_notes` text,
	`grooming_notes` text,
	`preferred_groomer_id` int,
	`moego_pet_id` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `retail_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`sku` varchar(100),
	`description` text,
	`category` varchar(100),
	`price_aud` decimal(10,2) NOT NULL,
	`cost_aud` decimal(10,2),
	`stock_qty` int NOT NULL DEFAULT 0,
	`reorder_threshold` int NOT NULL DEFAULT 5,
	`image_url` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `retail_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`user_id` int,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`role` enum('owner','groomer','bather','receptionist','manager') NOT NULL DEFAULT 'groomer',
	`colour_hex` varchar(7) NOT NULL DEFAULT '#6366f1',
	`is_active` boolean NOT NULL DEFAULT true,
	`xero_employee_id` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`phone` varchar(30),
	`email` varchar(320),
	`address` text,
	`logo_url` text,
	`timezone` varchar(64) NOT NULL DEFAULT 'Australia/Brisbane',
	`subscription_plan` enum('trial','starter','professional','enterprise') NOT NULL DEFAULT 'trial',
	`subscription_status` enum('active','past_due','cancelled','trialing') NOT NULL DEFAULT 'trialing',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`staff_id` int NOT NULL,
	`clock_in` timestamp NOT NULL,
	`clock_out` timestamp,
	`break_minutes` int NOT NULL DEFAULT 0,
	`total_minutes` int,
	`notes` text,
	`xero_synced` boolean NOT NULL DEFAULT false,
	`xero_timesheet_id` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `timesheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointment_id` int NOT NULL,
	`from_state` enum('scheduled','checked_in','bathing','grooming','ready','complete','cancelled','no_show'),
	`to_state` enum('scheduled','checked_in','bathing','grooming','ready','complete','cancelled','no_show') NOT NULL,
	`changed_by_staff_id` int,
	`changed_at` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	CONSTRAINT `workflow_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `tenant_id` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_pet_id_pets_id_fk` FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_line_items` ADD CONSTRAINT `invoice_line_items_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_line_items` ADD CONSTRAINT `invoice_line_items_product_id_retail_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `retail_products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `membership_payments` ADD CONSTRAINT `membership_payments_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_pet_id_pets_id_fk` FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `migration_jobs` ADD CONSTRAINT `migration_jobs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_photos` ADD CONSTRAINT `pet_photos_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_photos` ADD CONSTRAINT `pet_photos_pet_id_pets_id_fk` FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_photos` ADD CONSTRAINT `pet_photos_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pets` ADD CONSTRAINT `pets_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pets` ADD CONSTRAINT `pets_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pets` ADD CONSTRAINT `pets_preferred_groomer_id_staff_id_fk` FOREIGN KEY (`preferred_groomer_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `retail_products` ADD CONSTRAINT `retail_products_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff` ADD CONSTRAINT `staff_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff` ADD CONSTRAINT `staff_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timesheets` ADD CONSTRAINT `timesheets_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timesheets` ADD CONSTRAINT `timesheets_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_logs` ADD CONSTRAINT `workflow_logs_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_logs` ADD CONSTRAINT `workflow_logs_changed_by_staff_id_staff_id_fk` FOREIGN KEY (`changed_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_appt_tenant_date` ON `appointments` (`tenant_id`,`scheduled_start`);--> statement-breakpoint
CREATE INDEX `idx_appt_staff` ON `appointments` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_appt_pet` ON `appointments` (`pet_id`);--> statement-breakpoint
CREATE INDEX `idx_clients_tenant` ON `clients` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_tenant` ON `invoices` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_client` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_tenant` ON `memberships` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_client` ON `memberships` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_photo_pet` ON `pet_photos` (`pet_id`);--> statement-breakpoint
CREATE INDEX `idx_pets_client` ON `pets` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_pets_tenant` ON `pets` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_product_tenant` ON `retail_products` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_tenant` ON `staff` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_timesheet_staff` ON `timesheets` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_appt` ON `workflow_logs` (`appointment_id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;
CREATE TABLE `grooming_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointment_id` int NOT NULL,
	`pet_id` int NOT NULL,
	`tenant_id` int NOT NULL,
	`overall_rating` enum('pawfect','great','good','okay','difficult') DEFAULT 'good',
	`mood` varchar(500),
	`additional_note` text,
	`coat_condition` enum('excellent','good','fair','poor','matted'),
	`skin_condition` enum('excellent','good','fair','irritated','flaky'),
	`eye_condition` enum('bright_clear','mild_discharge','needs_vet'),
	`ear_condition` enum('clean','mild_buildup','dirty','needs_vet'),
	`nail_condition` enum('trimmed','long','very_long','broken'),
	`teeth_condition` enum('clean','mild_tartar','heavy_tartar','needs_vet'),
	`before_photo_url` text,
	`before_photo_key` varchar(255),
	`after_photo_url` text,
	`after_photo_key` varchar(255),
	`recommended_frequency_weeks` int,
	`status` enum('draft','sent') NOT NULL DEFAULT 'draft',
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `grooming_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `grooming_reports` ADD CONSTRAINT `grooming_reports_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grooming_reports` ADD CONSTRAINT `grooming_reports_pet_id_pets_id_fk` FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grooming_reports` ADD CONSTRAINT `grooming_reports_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_report_appt` ON `grooming_reports` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_report_pet` ON `grooming_reports` (`pet_id`);
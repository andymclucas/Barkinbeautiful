CREATE TABLE `groom_style_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`pet_id` int NOT NULL,
	`appointment_id` int,
	`staff_id` int,
	`note` text NOT NULL,
	`blade_size` varchar(20),
	`body_length` varchar(50),
	`face_style` varchar(100),
	`ear_style` varchar(100),
	`tail_style` varchar(100),
	`photo_url` text,
	`photo_key` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groom_style_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD CONSTRAINT `groom_style_notes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD CONSTRAINT `groom_style_notes_pet_id_pets_id_fk` FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD CONSTRAINT `groom_style_notes_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `groom_style_notes` ADD CONSTRAINT `groom_style_notes_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_style_notes_pet` ON `groom_style_notes` (`pet_id`);--> statement-breakpoint
CREATE INDEX `idx_style_notes_tenant` ON `groom_style_notes` (`tenant_id`);
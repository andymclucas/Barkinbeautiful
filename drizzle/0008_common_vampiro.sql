CREATE TABLE `groom_style_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(150) NOT NULL,
	`service_type` varchar(50),
	`blade_size` varchar(20),
	`comb_size` varchar(20),
	`body_length` varchar(50),
	`head_style` varchar(100),
	`face_style` varchar(100),
	`ear_style` varchar(100),
	`tail_style` varchar(100),
	`leg_style` varchar(100),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groom_style_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `groom_style_presets` ADD CONSTRAINT `groom_style_presets_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_preset_tenant` ON `groom_style_presets` (`tenant_id`);
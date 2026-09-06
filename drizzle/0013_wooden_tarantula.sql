ALTER TABLE `staff` ADD `online_bookable` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `online_profile_photo_url` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `online_bio` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `online_services` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `online_max_dogs_per_slot` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `online_max_dogs_per_day` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `online_booking_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `online_bath_only_daily_limit` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `online_booking_slot_minutes` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `online_booking_lead_hours` int DEFAULT 24 NOT NULL;
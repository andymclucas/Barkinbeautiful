ALTER TABLE `clients` ADD `portal_login_email` varchar(320);--> statement-breakpoint
ALTER TABLE `clients` ADD `portal_account_status` enum('not_enabled','setup_pending','active','revoked') DEFAULT 'not_enabled' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `portal_setup_token_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `clients` ADD `portal_setup_expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `clients` ADD `portal_last_signed_in_at` timestamp;
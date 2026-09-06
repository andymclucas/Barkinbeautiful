CREATE TABLE `email_campaign_sends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaign_id` int NOT NULL,
	`client_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`status` enum('pending','sent','failed','bounced') NOT NULL DEFAULT 'pending',
	`resend_message_id` varchar(255),
	`opened_at` timestamp,
	`clicked_at` timestamp,
	`sent_at` timestamp,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_campaign_sends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`preview_text` varchar(500),
	`body_html` text NOT NULL,
	`body_text` text,
	`audience_filter` text,
	`status` enum('draft','scheduled','sending','sent','cancelled') NOT NULL DEFAULT 'draft',
	`scheduled_at` timestamp,
	`sent_at` timestamp,
	`total_recipients` int DEFAULT 0,
	`total_sent` int DEFAULT 0,
	`total_opened` int DEFAULT 0,
	`total_clicked` int DEFAULT 0,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_unsubscribes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`client_id` int,
	`email` varchar(320) NOT NULL,
	`unsubscribed_at` timestamp NOT NULL DEFAULT (now()),
	`reason` varchar(500),
	CONSTRAINT `email_unsubscribes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `session_id` varchar(64);--> statement-breakpoint
ALTER TABLE `memberships` ADD `payment_retry_scheduled_at` datetime;--> statement-breakpoint
CREATE INDEX `idx_send_campaign` ON `email_campaign_sends` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_send_client` ON `email_campaign_sends` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_tenant` ON `email_campaigns` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_unsub_tenant` ON `email_unsubscribes` (`tenant_id`);
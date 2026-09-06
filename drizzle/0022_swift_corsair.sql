ALTER TABLE `clients` ADD `stripe_customer_id` varchar(255);--> statement-breakpoint
ALTER TABLE `membership_payments` ADD `stripe_payment_intent_id` varchar(255);--> statement-breakpoint
ALTER TABLE `membership_payments` ADD `stripe_invoice_id` varchar(255);--> statement-breakpoint
ALTER TABLE `memberships` ADD `stripe_subscription_id` varchar(255);--> statement-breakpoint
ALTER TABLE `tenants` ADD `stripe_billing_mode` enum('prototype','live') DEFAULT 'prototype' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `stripe_connected_at` timestamp;
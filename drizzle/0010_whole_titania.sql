CREATE TABLE `sms_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL DEFAULT 1,
	`client_id` int,
	`appointment_id` int,
	`to_number` varchar(30) NOT NULL,
	`body` text NOT NULL,
	`twilio_sid` varchar(64),
	`status` enum('sent','failed','pending') NOT NULL DEFAULT 'pending',
	`type` enum('reminder','confirmation','ready_pickup','payment_failed','custom','campaign') NOT NULL DEFAULT 'custom',
	`error_message` text,
	`sent_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sms_logs` ADD CONSTRAINT `sms_logs_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_logs` ADD CONSTRAINT `sms_logs_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_sms_tenant` ON `sms_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_sms_client` ON `sms_logs` (`client_id`);
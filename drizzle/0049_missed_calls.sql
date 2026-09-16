CREATE TABLE `missed_calls` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` int NOT NULL DEFAULT 1,
  `client_id` int,
  `from_number` varchar(30) NOT NULL,
  `recording_url` text,
  `transcript_text` text,
  `transcription_status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
  `twilio_call_sid` varchar(64),
  `read_at` timestamp NULL,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `missed_calls_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
);
CREATE INDEX `idx_missed_calls_tenant` ON `missed_calls` (`tenant_id`);
CREATE INDEX `idx_missed_calls_client` ON `missed_calls` (`client_id`);

-- Who a batch is going to, and how each one went.
--
-- Written as 'pending' BEFORE any message is sent, so a crash leaves a
-- record of the intended list. Resuming skips rows already 'sent', which
-- is what makes a retry safe.
CREATE TABLE `mass_text_recipients` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batch_id` int NOT NULL,
  `client_id` int,
  `phone` varchar(32) NOT NULL,
  `status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `error_message` text,
  `sent_at` timestamp NULL,
  CONSTRAINT `mass_text_recipients_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_mass_text_recipients_batch_phone` UNIQUE(`batch_id`,`phone`)
);

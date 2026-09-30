-- Split payments: a booking can be settled in more than one transaction.
--
-- Before this there was nowhere to put "$100 on the card and the rest in
-- cash", or "the two owners each pay for their own dog". `appointments.price`
-- is a single figure and `invoices.payment_method` is a single enum, so a
-- part-payment could only be recorded by overwriting the price - which loses
-- both what was charged and what has actually been taken.
--
-- One row per transaction, against ONE appointment. A multi-dog booking is
-- several `appointments` rows sharing a `session_id`, each with its own price,
-- so paying per dog needs no extra structure: the rows hang off different
-- appointments. `client_id` is the payer, which is normally the appointment's
-- client but not always - a separated household, or a friend collecting.
--
-- `amount` may be negative: that is a refund or a reversal, and keeping it as
-- a row rather than editing the original preserves what happened at the
-- counter. `appointments.payment_status` is derived from the sum of these
-- rows (see shared/splitPayments.ts) and is never typed in by hand.
--
-- APPLY THIS BEFORE THE CODE REACHES main. A new table does not disturb any
-- existing query - unlike 0055, no bare select() starts naming new columns -
-- but the new payment procedures read and write this table on first use, so
-- code-first would mean a "table does not exist" error at the counter.
--
-- ONE statement, deliberately: foreign keys and indexes are inline rather
-- than in trailing ALTERs. MySQL/TiDB DDL is not transactional, so the
-- CREATE-then-ALTER shape used by 0045 can leave the table created, the
-- migration unrecorded, and a re-run failing on "table already exists".
CREATE TABLE `appointment_payments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `appointment_id` int NOT NULL,
  `client_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` enum('cash','eftpos','card','stripe','bank_transfer','store_credit','other') NOT NULL,
  `reference` varchar(255),
  `note` varchar(255),
  `recorded_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `appointment_payments_id` PRIMARY KEY(`id`),
  KEY `idx_appointment_payments_appointment` (`appointment_id`),
  KEY `idx_appointment_payments_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_appointment_payments_client` (`client_id`),
  CONSTRAINT `appointment_payments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `appointment_payments_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `appointment_payments_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `appointment_payments_recorded_by_user_id_users_id_fk` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);

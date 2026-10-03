-- Drawing one credit down against an appointment.
--
-- A row per redemption rather than only a counter on client_packages, so
-- "why does Holly have two left" has an answer. The unique key stops a
-- double-click spending two credits on the same groom.
CREATE TABLE `client_package_redemptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `client_package_id` int NOT NULL,
  `appointment_id` int NOT NULL,
  `credits` int NOT NULL DEFAULT 1,
  `redeemed_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_package_redemptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_package_redemption_appt` UNIQUE(`client_package_id`,`appointment_id`)
);

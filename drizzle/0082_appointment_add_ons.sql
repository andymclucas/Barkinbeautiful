-- Add-ons actually done on an appointment.
--
-- The salon's extras already exist as priced catalogue entries in
-- pricing_services (catalogue_type = 'add_on') — anal glands, teeth
-- cleaning, flea rinse, a de-matt on an overgrown coat. Nothing recorded
-- which ones were DONE, so every invoice carried a single line for the
-- groom and the extras were either lost or folded invisibly into a price
-- nobody could break down.
--
-- The price is COPIED here, not just referenced. A catalogue price is a
-- price list and it changes; an invoice is a record of what was charged
-- on a day. Joining to pricing_services for the figure would silently
-- rewrite every historical invoice the next time anal glands went from
-- $35 to $40. name is snapshotted for the same reason, and so a line
-- still reads correctly after a catalogue entry is renamed or retired.
--
-- pricing_service_id is kept, nullable, for reporting — "how much did
-- teeth cleaning earn this quarter" — and ON DELETE SET NULL so retiring
-- a catalogue entry cannot delete history or fail on a foreign key.
--
-- One statement per breakpoint: TiDB refuses a multi-statement batch and
-- its DDL is not transactional.
CREATE TABLE IF NOT EXISTS `appointment_add_ons` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL DEFAULT 1,
  `appointment_id` int NOT NULL,
  `pricing_service_id` int NULL,
  `name` varchar(255) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `quantity` int NOT NULL DEFAULT 1,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `appointment_add_ons_id` PRIMARY KEY(`id`),
  INDEX `idx_appt_add_ons_appointment` (`appointment_id`),
  INDEX `idx_appt_add_ons_tenant` (`tenant_id`),
  INDEX `idx_appt_add_ons_service` (`pricing_service_id`)
);
--> statement-breakpoint

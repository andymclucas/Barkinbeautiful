-- Clients waiting for a slot that does not exist yet.
--
-- The salon cancels about 105 bookings a quarter and December fills by
-- October. "Let me know if anything comes up" is said constantly and has
-- nowhere to live, so it lives in somebody's memory until they forget.
--
-- The date window is VARCHAR(10), not DATE or TIMESTAMP, and that is
-- deliberate. These are Brisbane CALENDAR dates — "any Tuesday in
-- November" — not instants. staff_blockouts stores its date as a
-- midnight-UTC timestamp and the whole file carries a warning about
-- reading it back ten hours out. A YYYY-MM-DD string cannot drift,
-- sorts correctly as text, and compares with no driver in the way.
--
-- preferred_staff_id is a PREFERENCE, not a filter: a client may well
-- take another groomer on the right day. The matching keeps them in the
-- list and flags whether it was the person they asked for, so staff
-- decide rather than the code deciding for them.
CREATE TABLE IF NOT EXISTS `waitlist_entries` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `pet_id` INT NOT NULL,
  `service_type` VARCHAR(40) NULL,
  `preferred_staff_id` INT NULL,
  `earliest_date` VARCHAR(10) NOT NULL,
  `latest_date` VARCHAR(10) NOT NULL,
  `time_of_day` ENUM('any','morning','afternoon') NOT NULL DEFAULT 'any',
  `note` VARCHAR(500) NULL,
  `status` ENUM('active','fulfilled','cancelled','expired') NOT NULL DEFAULT 'active',
  `created_by_user_id` INT NULL,
  `fulfilled_appointment_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `waitlist_entries_id` PRIMARY KEY(`id`),
  INDEX `idx_waitlist_tenant_status` (`tenant_id`, `status`),
  INDEX `idx_waitlist_client` (`client_id`)
);

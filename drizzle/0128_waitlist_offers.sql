-- One freed slot, put in front of one waiting client.
--
-- Separate from the entry because an entry is a standing wish that
-- outlives any slot, and one slot is offered to SEVERAL clients at once.
-- That last part is the whole reason a claim is a request rather than a
-- booking: offer a Tuesday to three people and two of them may tap it,
-- and approval is what decides between them instead of a race.
--
-- `token_hash`, never the token — the link travels by SMS and stays in
-- the thread afterwards. Same shape of secret as the photo links.
--
-- The slot is stored as its own columns rather than pointing at the
-- cancelled appointment. The cancelled row may be edited, reinstated or
-- cleaned up, and an offer has to keep meaning what it meant when it was
-- sent: this groomer, this time, this long.
CREATE TABLE IF NOT EXISTS `waitlist_offers` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `entry_id` INT NOT NULL,
  `staff_id` INT NULL,
  `scheduled_start` TIMESTAMP NOT NULL,
  `duration_minutes` INT NOT NULL,
  `service_type` VARCHAR(40) NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `status` ENUM('offered','claimed','approved','declined','withdrawn') NOT NULL DEFAULT 'offered',
  `offered_by_user_id` INT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `claimed_at` TIMESTAMP NULL,
  `decided_by_user_id` INT NULL,
  `decided_at` TIMESTAMP NULL,
  `appointment_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `waitlist_offers_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_waitlist_offer_token` UNIQUE(`token_hash`),
  INDEX `idx_waitlist_offers_entry` (`entry_id`),
  INDEX `idx_waitlist_offers_slot` (`tenant_id`, `scheduled_start`, `status`)
);

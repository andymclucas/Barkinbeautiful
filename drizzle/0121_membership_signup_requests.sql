-- A membership a client asked for, before anybody agreed to it.
--
-- Self-serve sign-up moves three things out of staff hands at once: the
-- weight that picks the price band, a weekly card charge, and ten to
-- twenty slots in a groomer's diary for the next year. Each of those is
-- cheap to get right at the moment of asking and expensive to unpick a
-- month later, so the request lands here and a person approves it.
--
-- Nothing is charged and no appointment exists while a row is `pending`.
-- The client and their dogs ARE real rows by then — they gave us their
-- details and the salon should see them — but the membership, the Stripe
-- subscription and the series all wait for `approved`.
--
-- `weekly_total` is the quote the client was shown and agreed to. The
-- approval re-derives it from the catalogue and compares: a price list
-- edited in between must not silently bill a different number than the
-- one on the screen they said yes to.
--
-- `interval_weeks` is on the request as well as on each dog because the
-- household shares one cadence — that is what makes it one visit — and
-- the series is planned from the request, not per dog.
--
-- No occurrence dates are stored. The twelve months are planned at
-- approval against the calendar as it is THEN; a series worked out when
-- the client filled the form is three days stale by the time anyone
-- looks at it.
CREATE TABLE IF NOT EXISTS `membership_signup_requests` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `status` ENUM('pending','approved','declined','withdrawn') NOT NULL DEFAULT 'pending',
  `staff_id` INT NULL,
  `first_scheduled_start` TIMESTAMP NOT NULL,
  `duration_minutes` INT NOT NULL,
  `interval_weeks` INT NOT NULL,
  `months_ahead` INT NOT NULL DEFAULT 12,
  `weekly_total` DECIMAL(10,2) NOT NULL,
  `client_note` VARCHAR(500) NULL,
  `decided_by_user_id` INT NULL,
  `decided_at` TIMESTAMP NULL,
  `decided_reason` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `membership_signup_requests_id` PRIMARY KEY(`id`),
  INDEX `idx_msr_tenant_status` (`tenant_id`, `status`),
  INDEX `idx_msr_client` (`client_id`)
);

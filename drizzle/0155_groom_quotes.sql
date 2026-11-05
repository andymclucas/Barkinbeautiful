-- Quotes for extra work found while the dog is at the salon.
--
-- The groomer finds matting, or an ear that needs attention, and asks the
-- owner to agree to the charge before doing the work. Andy chose this over a
-- prospective-client estimate and a draft invoice on 05/11/2026.
--
-- The salon can already put an extra charge on an appointment. What it could
-- not record is the OWNER'S ANSWER: who was asked, what figure they were
-- shown, what they said, when, and whether they said it themselves or staff
-- recorded it on their behalf. Those last two are different claims and a
-- dispute turns on which one happened, hence approval_source and
-- approval_note.
--
-- token_hash is SHA-256 only, exactly as waitlist_offers does it, because
-- the link travels by SMS and lingers in the client's thread for ever. It is
-- NULL until the quote is sent; MySQL allows any number of NULLs in a unique
-- index, so drafts do not collide.
--
-- expires_at is stored rather than derived from sent_at, so changing
-- QUOTE_EXPIRY_HOURS never retroactively expires a quote an owner is still
-- looking at. An expired quote bills nothing — silence is not consent.
--
-- No foreign keys, deliberately, same as pet_weights (0154): once the
-- snapshot chain is repaired drizzle-kit would try to add real ones against
-- live data, and an FK on appointment_id would make the bulk appointment
-- delete throw for any quoted dog. The delete paths clear these rows.
--
-- Its lines are a separate table in 0156, one statement per migration: TiDB
-- DDL is not transactional, so two CREATE TABLEs in one migration can leave
-- the first applied, the migration unrecorded, and a re-run failing on
-- "table already exists". Same trap as the ALTER rule in CLAUDE.md §6.
CREATE TABLE `groom_quotes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `appointment_id` INT NOT NULL,
  `pet_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `status` ENUM('draft','sent','approved','declined','expired','withdrawn') NOT NULL DEFAULT 'draft',
  `total` DECIMAL(10,2) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `token_hash` VARCHAR(64) NULL,
  `raised_by_user_id` INT NULL,
  `raised_by_staff_id` INT NULL,
  `sent_at` TIMESTAMP NULL,
  `expires_at` TIMESTAMP NULL,
  `decided_at` TIMESTAMP NULL,
  `approval_source` ENUM('client','staff') NULL,
  `approval_note` VARCHAR(255) NULL,
  `decided_by_user_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_groom_quotes_token` (`token_hash`),
  INDEX `idx_groom_quotes_appointment` (`tenant_id`, `appointment_id`),
  INDEX `idx_groom_quotes_open` (`tenant_id`, `status`, `expires_at`)
);

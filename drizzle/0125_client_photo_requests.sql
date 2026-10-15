-- A link the salon texts a client so they can send a photo.
--
-- The phone network will not carry one. The inbound Twilio webhook reads
-- only the message body, and Twilio's own documentation contradicts
-- itself about whether Australian numbers can receive MMS at all. On
-- 15/10/2026 a client whose dog came back cut was asked to text the
-- picture to a staff member's personal mobile, because there was nowhere
-- else for it to go — so the evidence of an injury lived on somebody's
-- phone rather than in the client's record.
--
-- `token_hash`, never the token: this link travels by SMS and sits in a
-- message thread afterwards. Storing only the SHA-256 means a copy of
-- this table cannot be used to upload. Same reasoning as the client
-- portal tokens, and the same 32-byte shape of secret behind it.
--
-- `upload_count` is incremented in SQL (count = count + 1), not read and
-- written back, so two photos sent at once cannot both see the same
-- number and let a client past the ceiling.
--
-- `pet_id` is nullable because not every photo is about a dog — a client
-- sending a picture of a rash, a receipt or a car park sign is still
-- something the salon wants filed against them.
CREATE TABLE IF NOT EXISTS `client_photo_requests` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `pet_id` INT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `reason` VARCHAR(255) NULL,
  `requested_by_user_id` INT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked_at` TIMESTAMP NULL,
  `revoked_by_user_id` INT NULL,
  `upload_count` INT NOT NULL DEFAULT 0,
  `last_upload_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `client_photo_requests_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_client_photo_request_token` UNIQUE(`token_hash`),
  INDEX `idx_cpr_tenant_client` (`tenant_id`, `client_id`)
);

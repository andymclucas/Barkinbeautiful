-- A photo a client actually sent in.
--
-- The image bytes live in `uploaded_images`, which is where every other
-- upload in this app goes — Forge object storage is not configured here,
-- so photos are base64 in the database. This row is the record of WHOSE
-- it is, which `uploaded_images` does not carry: it has a storage key and
-- nothing else.
--
-- Separate from `pet_photos` on purpose. Those are the salon's own groom
-- photos, shown on the grooming card and in the client portal gallery. A
-- photo a client sent to report an injury is not a portfolio picture and
-- must not appear in one.
--
-- Indexed by (tenant, client, created_at) because the only question ever
-- asked of it is "what has this client sent us", newest first.
CREATE TABLE IF NOT EXISTS `client_photos` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `request_id` INT NOT NULL,
  `pet_id` INT NULL,
  `storage_key` VARCHAR(255) NOT NULL,
  `content_type` VARCHAR(50) NOT NULL,
  `byte_size` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `client_photos_id` PRIMARY KEY(`id`),
  INDEX `idx_client_photos_client` (`tenant_id`, `client_id`, `created_at`),
  INDEX `idx_client_photos_request` (`request_id`)
);

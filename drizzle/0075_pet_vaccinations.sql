-- Vaccination and paperwork expiry per pet.
--
-- A row per record rather than columns on pets, because a dog has several
-- (C5, kennel cough, the signed customer form) each with its own date, and
-- because an expired one has to stay on file as history rather than be
-- overwritten by the renewal.
CREATE TABLE `pet_vaccinations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `pet_id` int NOT NULL,
  `kind` varchar(64) NOT NULL,
  `administered_on` date,
  `expires_on` date,
  `document_url` text,
  `verified_at` timestamp NULL,
  `verified_by_user_id` int,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pet_vaccinations_id` PRIMARY KEY(`id`)
);

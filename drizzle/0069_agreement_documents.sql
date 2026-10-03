-- The agreements a client signs: membership terms, salon policies.
--
-- The text is versioned rather than edited in place. A signature has to
-- mean "agreed to these exact words on this date"; editing the document a
-- client already signed would silently rewrite what they agreed to, which
-- is the one thing an agreement must never do. Publishing a change bumps
-- the version, and old signatures keep pointing at the version they signed.
CREATE TABLE `agreement_documents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `slug` varchar(64) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
  `requires_signature` boolean NOT NULL DEFAULT true,
  `requirement` enum('sign_once','every_booking','manual') NOT NULL DEFAULT 'manual',
  `created_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `agreement_documents_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_agreement_documents_slug_version` UNIQUE(`tenant_id`,`slug`,`version`)
);

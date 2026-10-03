-- One client agreeing to one version of one document.
--
-- document_version is stored rather than joined, so the record survives the
-- document being superseded: what they signed is a fact about that day.
-- signed_name is what the client typed; there is no drawn-signature canvas
-- and pretending otherwise would overstate what was captured.
CREATE TABLE `agreement_signatures` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `document_id` int NOT NULL,
  `document_version` int NOT NULL,
  `client_id` int NOT NULL,
  `signed_name` varchar(200) NOT NULL,
  `signed_at` timestamp NOT NULL DEFAULT (now()),
  `signed_ip` varchar(64),
  `signed_user_agent` text,
  `recorded_by_user_id` int,
  CONSTRAINT `agreement_signatures_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_agreement_signatures_once` UNIQUE(`tenant_id`,`document_id`,`document_version`,`client_id`)
);

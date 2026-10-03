-- Client notes as a list, with who wrote each one and when.
--
-- clients.notes is a single text field that everyone overwrites, so the
-- salon loses who said what. It stays as it is and is shown as the oldest
-- note; new notes land here.
CREATE TABLE `client_notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `client_id` int NOT NULL,
  `body` text NOT NULL,
  `pinned` boolean NOT NULL DEFAULT false,
  `created_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_notes_id` PRIMARY KEY(`id`)
);

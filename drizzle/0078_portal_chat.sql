-- Client portal chat: one thread per client, messages from the client, the
-- automated assistant, or a staff member.
--
-- Read state is kept as "last read at" timestamps rather than unread
-- counters, so a count is always derived from the messages themselves and
-- cannot drift out of step with them.
--
-- Indexes are declared inline and the two statements are separated with a
-- drizzle breakpoint: TiDB refuses a multi-statement batch outright, and
-- its DDL is not transactional, so the fewer statements the less there is to
-- half-apply. IF NOT EXISTS so a re-run after a partial failure is a no-op
-- rather than a duplicate-table error.

CREATE TABLE IF NOT EXISTS `portal_threads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `client_id` int NOT NULL,
  `status` enum('open','awaiting_staff','closed') NOT NULL DEFAULT 'open',
  `last_message_at` timestamp NULL,
  `last_client_message_at` timestamp NULL,
  `staff_last_read_at` timestamp NULL,
  `client_last_read_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `portal_threads_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_portal_threads_tenant_client` UNIQUE(`tenant_id`,`client_id`),
  INDEX `idx_portal_threads_tenant_status` (`tenant_id`,`status`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `portal_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `thread_id` int NOT NULL,
  `sender` enum('client','assistant','staff') NOT NULL,
  `staff_id` int,
  `body` text NOT NULL,
  `handed_off` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `portal_messages_id` PRIMARY KEY(`id`),
  INDEX `idx_portal_messages_thread` (`thread_id`,`created_at`),
  INDEX `idx_portal_messages_tenant` (`tenant_id`,`created_at`)
);

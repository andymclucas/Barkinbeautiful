-- Starring a conversation, shared across the salon.
--
-- Keyed by the same thread key getThreads already groups on:
-- "client:<id>" when the number is linked to a client, "number:<phone>"
-- when it is not. A thread is not a table, so there is no row to flag.
--
-- Starred is the presence of a row; unstarring deletes it. That avoids a
-- boolean that can drift out of step with the row's existence, and makes
-- the unique key the whole story.
--
-- Shared rather than per-user on purpose: Lauren starring a conversation
-- is telling the salon it matters, not making a private bookmark.
CREATE TABLE `message_thread_stars` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `thread_key` varchar(80) NOT NULL,
  `starred_by_user_id` int,
  `starred_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `message_thread_stars_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_message_thread_stars_tenant_key` UNIQUE(`tenant_id`,`thread_key`)
);

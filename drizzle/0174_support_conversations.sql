-- Support chat (Andy, 13/11/2026): a chat bubble on every staff screen.
-- The assistant answers first; if the person asks for a human, the
-- conversation is handed to Groomigo support (Andy) and carries on as a
-- live chat in the same window.
--
-- One row per conversation. `status` is where it stands:
--   ai       the assistant is answering
--   waiting  a person was asked for and has not replied yet
--   human    support has replied; the assistant stays out of it
--   closed   finished; the next message starts a new conversation
--
-- Per tenant, like issue_reports: a conversation belongs to the salon it
-- was started from. Additive: a new table names no existing SELECT or
-- INSERT. The messages are in 0175, one statement per migration.
CREATE TABLE `support_conversations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `user_name` VARCHAR(255) NULL,
  `status` ENUM('ai','waiting','human','closed') NOT NULL DEFAULT 'ai',
  `page_path` VARCHAR(512) NULL,
  `human_requested_at` TIMESTAMP NULL,
  `last_message_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_read_message_id` INT NOT NULL DEFAULT 0,
  `agent_read_message_id` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_support_conversations_user` (`user_id`, `status`),
  INDEX `idx_support_conversations_status` (`status`, `last_message_at`)
);

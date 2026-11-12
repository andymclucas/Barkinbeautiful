-- The messages of a support conversation (see 0174).
--
-- `sender` says who wrote it: the staff member (`user`), the assistant
-- (`ai`), Groomigo support (`human`), or the system itself (`system`, for
-- lines such as "Passed to a person").
CREATE TABLE `support_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `conversation_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `sender` ENUM('user','ai','human','system') NOT NULL,
  `sender_user_id` INT NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_support_messages_conversation` (`conversation_id`, `id`)
);

-- Things the SALON should know about, as distinct from the messages and
-- voicemails a person has to action.
--
-- A category rather than one column on `clients`: a client finishing their
-- portal signup is the first of these, and the next one will not be about a
-- client at all. `kind` is an enum so a new sort of event is a migration
-- rather than a free-text string nobody validates.
--
-- `read_at` is salon-wide on purpose. This is not "assigned to you" — once
-- anybody has seen that Jane set her portal up, the salon has seen it.
CREATE TABLE `system_notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `kind` ENUM('client_portal_activated') NOT NULL,
  `client_id` INT NULL,
  `read_at` TIMESTAMP NULL,
  `read_by_user_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

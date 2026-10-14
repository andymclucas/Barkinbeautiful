-- Let the bell carry a membership sign-up.
--
-- The new value is APPENDED. MySQL and TiDB store an enum as the ordinal
-- of its value in the declared list, so adding to the end leaves every
-- existing row reading exactly as it did. Inserting it anywhere else
-- would renumber the values after it and silently relabel live rows.
--
-- One statement, and nothing writes the new value until this has run —
-- the code that does ships behind it.
ALTER TABLE `system_notifications`
  MODIFY COLUMN `kind` ENUM('client_portal_activated','staff_invited','staff_account_created','membership_signup_requested') NOT NULL;

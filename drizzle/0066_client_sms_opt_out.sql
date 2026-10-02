-- When a client told us to stop texting them.
--
-- There is an emailUnsubscribes table but nothing for SMS, so a client
-- replying STOP was only logged and we kept texting. Under the Spam Act
-- 2003 a commercial message needs consent and a working opt-out.
--
-- Nullable: never opted out is the normal state, and we cannot invent a
-- date for the people who have already replied STOP in the past.
ALTER TABLE `clients` ADD COLUMN `sms_opted_out_at` timestamp NULL;

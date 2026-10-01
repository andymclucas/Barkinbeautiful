-- The missed-call auto-text must reach any given phone number AT MOST ONCE,
-- ever. The previous guard decided this in application code by scanning
-- sms_logs for a row whose body equalled the message text, which could not
-- deliver that guarantee:
--
--   * it failed OPEN - if the read returned nothing (or the database was
--     briefly unavailable) the caller was texted again;
--   * the record of having sent was written AFTER the send, asynchronously,
--     and a failed write was swallowed by a .catch, so a send could happen
--     with nothing recorded - guaranteeing a repeat on the next call;
--   * two calls from one number arriving together both read "not sent";
--   * it matched on the full message body, so any edit to the wording would
--     silently reset every client's history.
--
-- This table makes the database itself the arbiter: one row per number, with
-- a UNIQUE key. The handler INSERTs the claim first and only sends if the
-- insert won, so a duplicate key - from a webhook retry, a concurrent call,
-- a process restart or a redeploy - deterministically means "already texted".
--
-- Idempotent on purpose: CREATE TABLE IF NOT EXISTS + INSERT IGNORE, because
-- MySQL/TiDB DDL is not transactional and this file contains two statements.
CREATE TABLE IF NOT EXISTS `missed_call_auto_texts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` int NOT NULL DEFAULT 1,
  `phone_e164` varchar(30) NOT NULL,
  `first_call_sid` varchar(64),
  `send_status` enum('claimed','sent','failed') NOT NULL DEFAULT 'claimed',
  `twilio_sid` varchar(64),
  `error_message` text,
  `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `uq_missed_call_auto_text_number` UNIQUE (`tenant_id`, `phone_e164`)
);
--> statement-breakpoint

-- Backfill every number that has already received the auto-text, so none of
-- them is texted a second time now that the new guard is authoritative.
-- The CASE mirrors autoTextPhoneKey() in shared/missedCallAutoText.ts:
-- sms_logs holds a mix of "+61..." and raw "04..." formats.
INSERT IGNORE INTO `missed_call_auto_texts`
  (`tenant_id`, `phone_e164`, `send_status`, `claimed_at`)
SELECT
  `tenant_id`,
  CASE
    WHEN `to_number` LIKE '0%'  THEN CONCAT('+61', SUBSTRING(`to_number`, 2))
    WHEN `to_number` LIKE '61%' THEN CONCAT('+', `to_number`)
    WHEN `to_number` LIKE '+%'  THEN `to_number`
    ELSE CONCAT('+', `to_number`)
  END AS `phone_e164`,
  'sent',
  MIN(`sent_at`)
FROM `sms_logs`
WHERE `direction` = 'outbound'
  AND `body` LIKE 'Thank you for calling Barkin%sorry we missed your call%'
  AND `to_number` REGEXP '^[+]?[0-9]+$'
GROUP BY `tenant_id`, `phone_e164`;

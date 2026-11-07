-- Let the Messages thread tell a rebook nudge apart from a staff message.
--
-- `sms_logs` IS the conversation staff read on the client record, so an
-- automated nudge logged as "custom" would be indistinguishable from something
-- a person typed and sent. Added with the rebook reminder, 07/11/2026.
--
-- APPENDED AT THE END, deliberately. MySQL stores an ENUM by the index of its
-- label, so adding a value anywhere but the end re-maps every existing row to
-- its neighbour — 'cancellation' rows would silently read as 'reschedule'. At
-- the end, existing rows keep their index and nothing is rewritten.
--
-- MODIFY COLUMN restates the whole definition, so NOT NULL and DEFAULT 'custom'
-- are repeated here on purpose: omitting them would drop them.
--
-- MIGRATE BEFORE THE CODE MERGES. The rebook job inserts rows with this value
-- and the insert fails on an enum that does not carry it yet.
ALTER TABLE `sms_logs`
  MODIFY COLUMN `type` ENUM('reminder','confirmation','ready_pickup','payment_failed','tracker','custom','campaign','inbound','cancellation','reschedule','rebook') NOT NULL DEFAULT 'custom';

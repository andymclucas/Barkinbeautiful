-- Let sms_logs record a cancellation and a reschedule.
--
-- Andy, 04/11/2026: "Send auto cancellation and reschedule texts also."
--
-- `sms_logs.type` is an ENUM, and the two new messages are not in it.
-- Without this the text SENDS and the log INSERT is then rejected by
-- the database — the worst possible half-success, because smsLogs IS
-- the Messages conversation thread staff read. The client would have
-- a text the salon has no record of, and the next person to ask "did
-- we tell them?" would be told no.
--
-- Caught by the type-checker rather than in production: Drizzle types
-- the column from the enum, so `type: "cancellation"` failed `pnpm run
-- check`. It would not have failed any test — the hermetic suite has no
-- database.
--
-- A SEPARATE migration from 0152 on purpose. 0152 is two ADD COLUMNs,
-- which belong in one ALTER; this is a MODIFY COLUMN on a different
-- table. The project's rule after TiDB rejected a column and its index
-- in one statement is one statement per migration whenever the change
-- is not plainly the same kind of thing — a failure is then always
-- recorded truthfully in the ledger.
--
-- Widening an enum leaves every existing row valid: all eight current
-- values are kept, in their current order, and two are appended. The
-- NOT NULL and the 'custom' default are restated because MySQL's MODIFY
-- COLUMN replaces the whole definition — omitting them would silently
-- drop both.
--
-- MIGRATE BEFORE THE CODE REACHES main, for the same reason as 0152.

ALTER TABLE `sms_logs`
  MODIFY COLUMN `type` ENUM(
    'reminder','confirmation','ready_pickup','payment_failed',
    'tracker','custom','campaign','inbound',
    'cancellation','reschedule'
  ) NOT NULL DEFAULT 'custom';

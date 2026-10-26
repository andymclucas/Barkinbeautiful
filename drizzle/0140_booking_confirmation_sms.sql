-- When the client was texted to say their dog is booked in.
--
-- Andy, 26/10/2026: "Setup a full workflow for automated SMS to clients
-- once an appointment is booked in Groomigo."
--
-- A TIMESTAMP rather than the boolean used by tracker_sms_sent, matching
-- reminder_sent_at instead. "Sent at 14:32" answers the question a human
-- actually asks when a client says they got nothing or got two; a bare
-- true does not.
--
-- This column is the ONLY thing between one text and one per retry, so
-- it is written in the same statement that claims the send — see
-- server/bookingConfirmation.ts.
--
-- Nullable with no default, so every existing appointment reads NULL and
-- no backfill can text anybody about a booking made months ago.
ALTER TABLE `appointments`
  ADD COLUMN `confirmation_sms_sent_at` TIMESTAMP NULL;

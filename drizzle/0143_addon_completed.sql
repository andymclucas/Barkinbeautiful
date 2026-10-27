-- Ticking off an add-on once it has actually been done.
--
-- Lauren, 27/10/2026: "We have to go out the back to make sure the
-- bathers have seen the add on note. We need them to be able to put a
-- tick next to it so we know it's checked off & completed."
--
-- The board already shows WHICH extras a dog needs — that landed on
-- 22/10/2026 — but nothing recorded whether one had been done, so the
-- only way to find out was to walk out the back and ask.
--
-- A TIMESTAMP rather than a boolean, matching reminder_sent_at and
-- confirmation_sms_sent_at: "done at 11:40" answers the question a
-- human actually asks, and a bare true does not. The staff id says who,
-- with no foreign key so a staff member can leave without rewriting
-- history — same as appointments.staff_id.
--
-- Both nullable: every existing add-on reads "not done", which is the
-- honest state for work nobody recorded.
ALTER TABLE `appointment_add_ons`
  ADD COLUMN `completed_at` TIMESTAMP NULL,
  ADD COLUMN `completed_by_staff_id` INT NULL;

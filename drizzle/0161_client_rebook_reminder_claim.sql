-- What stops a client being nudged twice for the same groom cycle.
--
-- Keyed on the CLIENT, not the dog. A two-dog household books two appointments
-- and makes one trip, and Andy's standing rule on texts is "Do not ever send 2
-- or 3" — so Scott Barker gets one message naming Effie and Dusty, and the
-- thing that is spent is his.
--
-- `rebook_reminder_for` holds the expected DAY the text was about rather than
-- just when it went. That day only moves when the household comes in again,
-- which is the next cycle, so comparing against it gives exactly one reminder
-- per cycle and a fresh one afterwards. A plain "sent at" timestamp could not
-- tell a second nudge this cycle from the first nudge of the next.
--
-- Both nullable with no default: every one of the 10,113 existing clients is
-- correctly "never nudged", which is what NULL already means.
--
-- MIGRATE BEFORE THE CODE MERGES, as 0160.
ALTER TABLE `clients`
  ADD COLUMN `rebook_reminder_sent_at` TIMESTAMP NULL,
  ADD COLUMN `rebook_reminder_for` DATE NULL;

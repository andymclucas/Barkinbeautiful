-- Who opened a missed call, not just that someone did.
--
-- read_at already records that a missed call was opened. It does not record
-- by whom, so there was no way to tell that a voicemail had been looked at
-- and then left without a call back. Nullable: every existing row was read
-- (or not) before we started recording this, and we cannot invent a name.
ALTER TABLE `missed_calls` ADD COLUMN `read_by_user_id` int NULL;

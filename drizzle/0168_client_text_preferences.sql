-- Per-client switches for two automated texts (Andy, 11/11/2026, after
-- Lauren cancelled a sick dog's booking and did not want the owner texted
-- "call us any time to rebook"). NULL = the client gets the text; a
-- timestamp = turned off for this client, and when. Same shape as
-- sms_opted_out_at. Both nullable with no default, so the old code keeps
-- working through the gap between migrating and merging.
ALTER TABLE `clients` ADD COLUMN `confirmation_sms_off_at` TIMESTAMP NULL, ADD COLUMN `cancellation_sms_off_at` TIMESTAMP NULL;

-- The start times a groomer takes online bookings at, as a JSON list of
-- "HH:MM" Brisbane times. NULL means the groomer has no limit of their own
-- and takes every start the salon offers online.
--
-- Lauren, 27/11/2026: herself at 11, 12, 12:30 and 1pm only; Ash no later
-- than 12:30, as she finishes at 2pm.
--
-- Nullable with no default, so code that does not know the column keeps
-- inserting staff without it. Apply BEFORE the code that reads it merges.
ALTER TABLE `staff` ADD `online_start_times` text;

-- The heaviest dog a groomer takes through online booking, in kg. NULL
-- means no limit of their own.
--
-- Lauren, 27/11/2026: "I dont really want to book in large dogs in my box"
-- after a 40kg shepherd was booked online into her column.
--
-- Nullable with no default, so code that does not know the column keeps
-- inserting staff without it. Apply BEFORE the code that reads it merges.
ALTER TABLE `staff` ADD `online_max_weight_kg` int;

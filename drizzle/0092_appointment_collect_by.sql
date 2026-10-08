-- When a dog has to be gone by.
--
-- Not the same as estimated_pickup_at, which is when WE think the groom
-- will be finished. This is a constraint the CLIENT set — "she has to be
-- home by twelve" — and the bathers need to see it, because by the time a
-- dog is late the chance to reorder the queue has gone.
--
-- Nullable, and null is the normal case: most dogs have no deadline at all.
ALTER TABLE `appointments` ADD COLUMN `collect_by` timestamp NULL;

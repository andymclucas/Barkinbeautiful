-- Who caused it, and a line of context.
--
-- "Trackable and time-stamped" needs more than created_at: a staff account
-- appearing is only useful if you can see who added them. actor_user_id is
-- NULL when the actor is not a platform user — a client setting up their own
-- portal is the obvious case.
ALTER TABLE `system_notifications`
  ADD COLUMN `actor_user_id` INT NULL,
  ADD COLUMN `detail` VARCHAR(500) NULL;

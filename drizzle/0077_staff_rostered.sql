-- Whether a staff member takes appointments.
--
-- Separate from is_active on purpose. Deactivating takes someone off the
-- platform; this only takes them off the roster. Andy administers the
-- system and does not groom, so he needs a login, admin rights and a
-- staff record — but no column on the Appointments calendar and no way
-- to be assigned a dog.
--
-- Defaults to true so every existing staff member keeps their column.
ALTER TABLE `staff` ADD COLUMN `rostered` boolean NOT NULL DEFAULT true;

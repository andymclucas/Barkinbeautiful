-- A user's own order for the calendar's groomer and bather columns.
--
-- Andy, 26/10/2026: "save it to their profile so any changes becomes
-- their default view." To the PROFILE, not the browser: the existing
-- calendar column filter lives in localStorage, which is per-device, and
-- Andy works on both an iPad and a desktop.
--
-- A comma-separated list of staff ids, parsed in JS by
-- shared/staffColumnOrder.ts. NOT json: TiDB has no JSON_TABLE, and a
-- query that assumed otherwise broke every client record on 22/10/2026.
-- Same shape as pets.moego_pet_codes, which is read the same way.
--
-- Nullable with no default, so NULL means "no preference" and every
-- existing user keeps exactly the order they see today.
ALTER TABLE `users`
  ADD COLUMN `staff_column_order` VARCHAR(512) NULL;

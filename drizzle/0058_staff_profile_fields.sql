-- Let staff keep their own details: the two fields the table was missing.
--
-- `staff` already carries name, email, phone, emergency_contact (a name) and
-- emergency_phone, so the self-service profile only needs an email address
-- for the emergency contact, and the ice cream.
--
-- The ice cream flavour is not a joke column. A salon roster is the kind of
-- place a small human detail belongs, and the owner asked for it - it goes in
-- the staff profile beside the contact details rather than in a note field
-- nobody reads.
--
-- APPLY THIS BEFORE THE CODE REACHES main. Drizzle names every column
-- declared in schema.ts in every bare select(), so the moment these exist in
-- the schema file the app asks the database for them on every staff query -
-- including requireApprovedStaffTenant, which gates the whole salon floor.
--
-- One statement: MySQL/TiDB DDL is not transactional, so two ALTERs could
-- leave the first applied, the migration unrecorded, and a re-run failing on
-- "Duplicate column name".
ALTER TABLE `staff`
  ADD COLUMN `emergency_email` varchar(320),
  ADD COLUMN `favourite_ice_cream` varchar(100);

-- Per-section admin rights for staff.
--
-- Until now "admin" was one bit on `users.role`, and six people held it -
-- four of them groomers who were made admins to reach the salon floor. It
-- granted everything: personnel, pricing, branding, billing. There was no way
-- to let the receptionist manage clients without also letting them change
-- wages.
--
-- `is_admin` is the right to administer at all. `admin_sections` is the JSON
-- list of sections they may change, matching the ten in the sidebar (see
-- shared/staffPermissions.ts, which is the canonical list).
--
-- Both are deliberately separate: revoking rights must not require also
-- clearing the tick boxes, so that restoring someone brings back what they
-- had. canEditSection() requires BOTH, so a stale section list grants
-- nothing on its own.
--
-- APPLY THIS BEFORE THE CODE REACHES main. Drizzle names every column
-- declared in schema.ts in every bare select(), so the moment these exist in
-- the schema file the app asks for them on every staff query - including
-- requireApprovedStaffTenant, which gates the whole salon floor.
--
-- One statement: MySQL/TiDB DDL is not transactional, so two ALTERs could
-- leave the first applied, the migration unrecorded, and a re-run failing on
-- "Duplicate column name".
ALTER TABLE `staff`
  ADD COLUMN `is_admin` boolean NOT NULL DEFAULT false,
  ADD COLUMN `admin_sections` json;

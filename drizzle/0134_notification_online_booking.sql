-- A bell notification when the public books.
--
-- Adding a value to an enum, which MySQL does by restating the whole
-- list. Every existing value is repeated unchanged; dropping one would
-- silently invalidate the rows holding it.
--
-- Its own migration rather than squeezed in with 0133: they are
-- different tables so they need separate ALTERs anyway, and MySQL DDL is
-- not transactional — two statements in one migration can leave the
-- first applied and the migration unrecorded (CLAUDE.md §6).
ALTER TABLE `system_notifications`
  MODIFY COLUMN `kind` ENUM(
    'client_portal_activated',
    'staff_invited',
    'staff_account_created',
    'membership_signup_requested',
    'online_booking_received'
  ) NOT NULL;

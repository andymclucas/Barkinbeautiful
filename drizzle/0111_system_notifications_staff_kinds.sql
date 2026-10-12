-- Someone being given access to the platform, as its own kind.
--
-- Appended to the end: MySQL stores an ENUM as its ordinal, so inserting in
-- the middle would relabel existing rows.
--
-- staff_access_events still carries the detailed per-staff audit trail; this
-- table is the salon's notification feed, which needs read state an audit
-- table should not have.
ALTER TABLE `system_notifications`
  MODIFY COLUMN `kind` ENUM(
    'client_portal_activated',
    'staff_invited',
    'staff_account_created'
  ) NOT NULL;

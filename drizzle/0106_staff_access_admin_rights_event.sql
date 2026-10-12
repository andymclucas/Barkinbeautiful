-- An audit row for an admin-rights change.
--
-- Appended to the end of the enum, never reordered: MySQL stores an ENUM as
-- the ordinal, so inserting a value in the middle silently relabels every
-- existing row. Adding at the end leaves all 7 existing values on their
-- current ordinals.
ALTER TABLE `staff_access_events`
  MODIFY COLUMN `event_type` ENUM(
    'invited','accepted','approved','revoked',
    'workflow_updated','bath_priority_updated','grooming_card_uploaded',
    'admin_rights_changed'
  ) NOT NULL;

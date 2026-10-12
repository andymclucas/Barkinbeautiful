-- An audit row for a salon-role change (groomer → manager, and so on),
-- distinct from admin_rights_changed: a role is what the salon calls someone,
-- admin rights are what the software lets them edit.
--
-- Appended to the end again. MySQL stores an ENUM as its ordinal, so adding
-- in the middle would relabel every existing row.
ALTER TABLE `staff_access_events`
  MODIFY COLUMN `event_type` ENUM(
    'invited','accepted','approved','revoked',
    'workflow_updated','bath_priority_updated','grooming_card_uploaded',
    'admin_rights_changed','role_changed'
  ) NOT NULL;

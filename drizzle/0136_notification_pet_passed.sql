-- A bell row when a dog dies and money is still attached to the household.
--
-- Andy, 22/10/2026. Kayla Fellingham was on a $30-a-week two-dog plan
-- whose two dogs had both died, and nothing anywhere said so — the
-- membership logic existed but only ran if somebody went looking.
--
-- Adding a value to an enum, which MySQL does by restating the whole
-- list. Every existing value is repeated unchanged; dropping one would
-- silently invalidate the rows holding it.
ALTER TABLE `system_notifications`
  MODIFY COLUMN `kind` ENUM(
    'client_portal_activated',
    'staff_invited',
    'staff_account_created',
    'membership_signup_requested',
    'online_booking_received',
    'pet_passed_membership_review'
  ) NOT NULL;

-- First pass at which existing codes are Warnings, so the red badges are
-- right on the day this ships rather than after somebody has ticked
-- forty boxes. It is a starting point: every one of these can be moved
-- back to Codes from Pricing & Services -> Pet codes.
--
-- Matched by exact code text, and by meaning for the emoji codes (an
-- emoji can carry an invisible variation selector, so matching on it is
-- fragile). A salon with none of these codes is simply unaffected.
--
-- Deliberately left as Codes: clip specs and routine instructions
-- (#n PFFT, ALL OFF, PLUCK EARS, LEAVE EYELASHES, REAR DEW CLAWS, OILY).
--
-- One statement, in its own migration, so the ledger records it
-- truthfully whatever happens.
UPDATE `pet_codes` SET `is_warning` = 1
WHERE `code` IN (
  'DOG AGGRESSIVE', 'CAGE AGGRESSIVE', 'MUZZLE',
  'Bit', 'Bites', 'Bites For Feet/ Nails',
  'SENSITIVE', 'SKIN SENSITIVE', 'Ner',
  'FREAKS @ DRYER', 'DIFFICULT TO BLOWDRY', 'NO CAGE DRYING',
  'LEAD CHEWER', 'LEAD IN CAGE', 'Lead ON', 'Lead On In Cage',
  'KEEP DOGS SEPARATE', 'KEEP IN CRATE', 'No crate', 'TIE UP',
  'PITA', 'CANNOT COMPLETE GROOM', 'CANNOT COMPLETE SEND HOME',
  'EX. CARE', 'PREPAY',
  'EPILEPSY', 'SEDATED', 'BAD LEGS', 'BAD SKIN', 'HIP DYSPLAYSIA',
  'OLD and SORE', 'WARTS', 'WARTS/ MOLES', 'Ale', 'Art',
  'DON''T SHAVE GROIN/BUM', 'DONT SHAVE GROIN', 'DONT PLUCK EARS',
  'NO 10B GROIN/BUM'
)
OR `description` IN (
  'Aggressive', 'Angry', 'Red flag',
  'Heart problems', 'Medication', 'Blind', 'Deaf', 'Arthritis'
);

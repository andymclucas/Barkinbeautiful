-- A review left on the public grooming card.
--
-- Appended to the end: MySQL stores an ENUM as its ordinal, so inserting in
-- the middle relabels existing rows.
ALTER TABLE `client_reviews`
  MODIFY COLUMN `source` ENUM('portal','staff_entered','imported','grooming_card')
  NOT NULL DEFAULT 'staff_entered';

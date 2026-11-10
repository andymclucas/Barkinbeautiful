-- The text colour on a pet-code badge (Andy, 11/11/2026: "black text on a
-- red background can't be read very well"). NULL = automatic, whichever of
-- black or white contrasts more with the badge colour, as before.
ALTER TABLE `pet_codes` ADD COLUMN `text_colour_hex` VARCHAR(16) NULL;

-- MoeGo's client tags and free-text note, for the 321 and 609 clients that
-- carry them.
--
-- The tags are the salon's own operational vocabulary and several are things
-- nobody should be able to miss when a booking is being taken: BANNED (28
-- clients), Refuse new bookings (31), DONT BOOK IN (19), MUST PRE-PAY (9),
-- Owes money, DOG AGRESSIVE, KEEP DOGS SEPARATE. Groomigo currently knows
-- none of it, so a banned client can be booked without a murmur.
--
-- The note is free text and carries the same mix: alternative contacts
-- ("Kerri Middleton - 0421 801 761"), commercial facts ("HAS $50 VOUCHER")
-- and the occasional thing that matters a great deal — one reads "Sarah
-- Gibson 0412 905 907 / DOG BITES VERY HARD."
--
-- Kept in their own columns rather than appended to clients.notes, which is
-- already used for merge audit trails ("Merged into client #633 on
-- 2026-10-04") and should not have two unrelated meanings.
--
-- Stored verbatim. The vocabulary is the salon's and classifying it is not
-- this import's job, same reasoning as the pet codes in 0096.
--
-- Both columns in ONE ALTER: these are plain ADD COLUMNs with no index, so
-- TiDB takes them together.
ALTER TABLE `clients`
  ADD COLUMN `moego_tags` TEXT NULL,
  ADD COLUMN `moego_notes` TEXT NULL;

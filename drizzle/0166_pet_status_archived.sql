-- A third pet status: archived. Andy, 10/11/2026: "Let's make an 'archive
-- dog' button."
--
-- Until now `pets.status` was active|departed, so the only way to take a
-- dog that no longer comes (or a duplicate record) off the booking lists
-- was to record it as PASSED AWAY — and five of seven "departed" dogs on
-- 19/10/2026 were duplicates wearing memorial wings. Archived is the
-- honest version: hidden from booking and lists, history kept, and
-- restorable.
--
-- APPENDED AT THE END, deliberately (same reason as 0162): MySQL stores an
-- ENUM by index, so a value inserted mid-list re-maps every existing row.
-- MODIFY COLUMN restates the whole definition, so NOT NULL and the default
-- are repeated on purpose.
--
-- MIGRATE BEFORE THE CODE MERGES. Old code never writes 'archived', so
-- this is safe to run first; new code writes it, and the write fails on
-- an enum that does not carry it.
ALTER TABLE `pets`
  MODIFY COLUMN `status` ENUM('active','departed','archived') NOT NULL DEFAULT 'active';

-- A shareable link for a grooming card.
--
-- The salon wants to send a client a direct link to their dog's report, the
-- way MoeGo does (my.moego.pet/grooming/report/<token>), and the portal wants
-- each card to be a page of its own rather than one of a stack rendered
-- inline.
--
-- Nullable and with no default: a report only gets a token when someone first
-- asks to share it, so the column stays empty for the reports nobody links to.
-- That also keeps old inserts valid, which is what makes shipping the
-- migration ahead of the code safe.
--
-- 32 chars holds the 24-character token `groomingShareToken` generates with
-- room to spare.
--
-- The unique index is deliberately NOT here: TiDB rejects ADD COLUMN and
-- ADD INDEX on that column in one ALTER ("column does not exist"), so it is
-- its own migration, 0099. See CLAUDE.md section 6.
ALTER TABLE `grooming_reports`
  ADD COLUMN `share_token` VARCHAR(32) NULL;

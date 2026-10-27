-- Pausing a membership with a restart already decided.
--
-- A client goes away and the salon stops the debit without cancelling a
-- membership they mean to keep. Pause existed, but only indefinitely and
-- only with a manual restart, so somebody had to remember.
--
-- `pause_mode` is also the discriminator this feature needs. `status`
-- already uses "paused" for BOTH a deliberate pause and the suspension
-- the failed-payment escalation applies at strike two; only a deliberate
-- pause sets `pause_mode`, so only a deliberate pause can be resumed by
-- the scheduled sweep. Without it, a sweep would put a client who had
-- never paid back onto automatic billing.
--
-- All three are ADD COLUMN, so they belong in one ALTER: MySQL/TiDB DDL
-- is not transactional, and separate statements can leave the first
-- applied, the migration unrecorded, and a re-run failing on "Duplicate
-- column name".
--
-- No index. The sweep reads `status = 'paused'` with a non-null
-- `pause_mode`, and the table holds ~153 rows for the only live tenant —
-- a scan is cheaper than the index, and adding one would need a second
-- migration anyway because TiDB refuses a column and an index on it in
-- the same ALTER.
--
-- Nullable with no default, so rows written by the currently deployed
-- code stay valid and every existing membership reads as "not
-- deliberately paused", which is what they are.

ALTER TABLE `memberships`
  ADD COLUMN `pause_mode` ENUM('cycles','date','manual') NULL,
  ADD COLUMN `pause_resumes_at` DATETIME NULL,
  ADD COLUMN `paused_at` DATETIME NULL;

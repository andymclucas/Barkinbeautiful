-- The unique index for 0098's share_token, in its own migration because TiDB
-- will not add a column and index it in the same ALTER.
--
-- Unique matters: the token IS the authorisation for an unauthenticated
-- reader, so two reports must never be reachable by one link. The lookup is
-- also the hot path for the public card page.
--
-- NULLs do not collide in a MySQL/TiDB unique index, so every unshared report
-- can hold NULL.
ALTER TABLE `grooming_reports`
  ADD UNIQUE INDEX `uniq_grooming_report_share_token` (`share_token`);

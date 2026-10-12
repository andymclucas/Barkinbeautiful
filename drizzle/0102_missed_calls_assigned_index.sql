-- Separate migration: TiDB rejects adding a column and indexing it in one
-- ALTER. Tenant first, because every query filters on it.
ALTER TABLE `missed_calls`
  ADD INDEX `idx_missed_calls_assigned` (`tenant_id`, `assigned_staff_id`);

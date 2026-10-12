-- TiDB will not create a table and index it in one statement, so the index
-- is its own migration. Tenant first, because every read filters on it, then
-- read_at so the unread lookup does not scan the table as it grows.
ALTER TABLE `system_notifications`
  ADD INDEX `idx_system_notifications_tenant_read` (`tenant_id`, `read_at`);

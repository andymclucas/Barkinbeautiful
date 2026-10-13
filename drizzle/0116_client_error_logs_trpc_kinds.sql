-- Record a failed tRPC request alongside the other client-side failures.
--
-- /api/client-error whitelists `kind` against this enum, so a report with a
-- kind that is not listed is silently dropped. Query failures had nowhere
-- to go: they went to console.error, where nobody looks, while the
-- component rendered its empty state. The Net sales chart read "No sales in
-- this period" for months because its query was rejected on every load.
--
-- The two new values are APPENDED. MySQL and TiDB store an enum as the
-- ordinal of its position, so inserting a value in the middle would
-- silently relabel every existing row — 'window_error' rows would start
-- reading as whatever took their slot. Only ever add to the end.
--
-- One statement, so a failure is recorded truthfully in the ledger.
ALTER TABLE `client_error_logs`
  MODIFY `kind` ENUM(
    'stuck_loading',
    'window_error',
    'unhandled_rejection',
    'react_error_boundary',
    'trpc_query_error',
    'trpc_mutation_error'
  ) NOT NULL;

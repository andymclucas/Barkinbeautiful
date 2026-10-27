-- The lookup index, in its own migration.
--
-- TiDB refuses a column and an index on it in one ALTER, and the same
-- caution applies to a fresh table: one statement per migration means a
-- failure is recorded truthfully in the ledger rather than leaving the
-- table created and the index missing with nothing to say so.
--
-- Leads with tenant_id, like every other index in this schema, because
-- every query filters on it first.

CREATE INDEX `idx_membership_pets_tenant_pet` ON `membership_pets` (`tenant_id`,`pet_id`);

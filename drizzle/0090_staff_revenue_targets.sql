-- A revenue target for each staff member.
--
-- Two columns in ONE ALTER on purpose: MySQL/TiDB DDL is not transactional,
-- so two statements can leave the first applied, the migration unrecorded,
-- and a re-run failing on "Duplicate column name".
--
-- revenue_target is NULL for anyone who has not been given one — which is
-- everybody on day one — and NULL means "no target", not "a target of zero".
-- A zero target would show every groomer at 100% of nothing.
--
-- The period is what the amount is EXPRESSED in, not how it is viewed. The
-- staff tab can show the same target against a day, a week, a month or a
-- quarter by scaling it, so the salon maintains one number per person rather
-- than four. Weekly is the default because a grooming roster is a weekly
-- shape.
ALTER TABLE `staff`
  ADD COLUMN `revenue_target` decimal(10,2) NULL,
  ADD COLUMN `revenue_target_period` enum('daily','weekly','monthly','quarterly') NOT NULL DEFAULT 'weekly';

-- Separate what was charged from what was collected.
--
-- `appointments.price` holds the amount COLLECTED (MoeGo net sales). After the
-- 30/09/2026 backfill a blank price meant five different things - unpaid,
-- cancelled, no-show, genuinely free, or simply never recorded - and there was
-- no way to tell them apart, so expected revenue could not be reported at all.
--
-- `gross_price` is what was charged before discounts and non-payment.
-- `payment_status` is MoeGo's own view of whether the money arrived.
--
-- APPLY THIS BEFORE THE CODE REACHES main. It is NOT order-independent.
-- Drizzle names every column declared in schema.ts in every bare select() and
-- every insert(), so the moment these columns exist in the schema file the app
-- asks the database for them. Code-first would break
-- requireApprovedStaffAppointmentAccess (17 procedures), updateWorkflowState
-- and all 8 appointment inserts - no dog could be moved between stages and no
-- booking could be created. Migration-first is safe: the old code never names
-- these columns, and they are nullable with no default, so existing inserts
-- simply leave them NULL.
--
-- One statement, not two. MySQL and TiDB DDL is not transactional, so two
-- separate ALTERs could leave gross_price added, the migration unrecorded, and
-- a re-run failing on "Duplicate column name".
ALTER TABLE `appointments`
  ADD COLUMN `gross_price` decimal(10,2),
  ADD COLUMN `payment_status` enum('unpaid','partial','paid');

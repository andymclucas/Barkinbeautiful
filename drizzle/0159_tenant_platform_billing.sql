-- Groomigo charging a salon for Groomigo.
--
-- Lauren's second salon, The Pet Pad, goes live 23/11/2026 as a paying
-- subscriber. Barkin' Beautiful is Andy's own and does not pay, so this is the
-- first money flowing TOWARDS the platform rather than through it.
--
-- Named `platform_*` deliberately, and NOT reusing stripe_account_id or
-- anything resembling clients.stripe_customer_id. Those belong to the opposite
-- direction: a dog owner paying the SALON, on the salon's own connected account
-- where it has one. A Stripe customer belongs to the account it was created on,
-- so mixing the two produces "No such customer" at best and bills the wrong
-- party at worst. The prefix is there so the next person cannot pick the wrong
-- column by reaching for the obvious name.
--
-- Three ADD COLUMNs in ONE ALTER, per CLAUDE.md section 6: MySQL/TiDB DDL is not
-- transactional, so separate statements can leave the first applied, the
-- migration unrecorded, and a re-run failing on "Duplicate column name". The
-- one-statement-per-migration rule that forbids combining is about adding a
-- column and an index together, which is not what this does.
--
-- MIGRATE BEFORE THE CODE MERGES. These are columns on `tenants`, not a new
-- table: Drizzle names every column declared in schema.ts in every bare
-- select() and insert(), so the moment schema.ts carries them the app asks the
-- database for them whether or not any code mentions them. Shipping the code
-- first breaks every read of `tenants`, which is most of the app.
ALTER TABLE `tenants`
  ADD COLUMN `platform_stripe_customer_id` VARCHAR(255) NULL,
  ADD COLUMN `platform_stripe_subscription_id` VARCHAR(255) NULL,
  ADD COLUMN `subscription_current_period_end` TIMESTAMP NULL;

-- Stripe Connect: each salon takes its clients' money into its own account.
--
-- Today every payment runs through one platform key, so a client paying
-- their groomer pays Groomigo's Stripe account. That is correct while
-- Groomigo IS Barkin' Beautiful and wrong the moment it is not: a second
-- salon's takings would land in somebody else's bank.
--
-- Express accounts. Stripe hosts the onboarding — bank details, identity,
-- compliance — so the salon clicks one button, answers Stripe's questions
-- and comes back. The platform never sees their keys and their money
-- never touches its balance.
--
-- stripe_connected_at already existed and was never written to; it is
-- used properly now.
--
-- platform_fee_bps is in BASIS POINTS, not percent: 250 is 2.5%. Percent
-- as a decimal invites a 0.025 / 2.5 confusion that is only discovered
-- when somebody is charged a hundred times too much.
--
-- NULL is not zero, the same distinction as the SMS overage rate. Zero
-- means Groomigo takes nothing, which is a real position. NULL means
-- nobody has decided, and nothing is charged until somebody does.
ALTER TABLE `tenants`
  ADD COLUMN `stripe_account_id` varchar(255) NULL,
  ADD COLUMN `stripe_charges_enabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN `stripe_payouts_enabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN `stripe_details_submitted` boolean NOT NULL DEFAULT false,
  ADD COLUMN `stripe_requirements_due` text NULL,
  ADD COLUMN `platform_fee_bps` int NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tenants_stripe_account` ON `tenants` (`stripe_account_id`);
--> statement-breakpoint

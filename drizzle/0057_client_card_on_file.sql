-- A card the salon can charge without the client present.
--
-- Stripe already gave us `clients.stripe_customer_id` when a client paid a
-- one-off invoice through Checkout, but a customer id alone cannot be
-- charged: an off-session PaymentIntent needs the payment method too. Without
-- it, weekly membership billing has nothing to bill and the retry job could
-- never actually attempt a payment.
--
-- The brand, last four and expiry are a copy of what Stripe holds, kept so
-- the salon can say "the Visa ending 4242 has expired" at the counter without
-- a round trip to Stripe, and so the weekly job can skip a card it can see is
-- dead rather than burning an attempt on it. No card number, CVC or full
-- expiry ever reaches this database - only what Stripe returns for display.
--
-- APPLY THIS BEFORE THE CODE REACHES main. Drizzle names every column
-- declared in schema.ts in every bare select(), so the moment these exist in
-- the schema file the app asks the database for them on every client query.
--
-- One statement: MySQL/TiDB DDL is not transactional, so separate ALTERs can
-- leave some columns added, the migration unrecorded, and a re-run failing on
-- "Duplicate column name".
ALTER TABLE `clients`
  ADD COLUMN `stripe_default_payment_method_id` varchar(255),
  ADD COLUMN `stripe_card_brand` varchar(40),
  ADD COLUMN `stripe_card_last4` varchar(4),
  ADD COLUMN `stripe_card_exp_month` int,
  ADD COLUMN `stripe_card_exp_year` int,
  ADD COLUMN `stripe_card_saved_at` timestamp NULL;

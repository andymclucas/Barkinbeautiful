-- The rebook nudge's salon switch, and how far ahead it lands.
--
-- Andy, 07/11/2026, with MoeGo's "Rebook reminder" screen: "Build this into the
-- text message workflow." MoeGo's own copy of it is switched Off, and so is
-- this: `rebook_reminder_enabled` defaults to FALSE and nothing sends until
-- somebody turns it on in Settings.
--
-- That default is load-bearing. This is the only automated text whose audience
-- is clients with NO appointment — every other one is bounded by a booking that
-- exists — so a column defaulting to TRUE would start texting the book on the
-- first cron run after deploy.
--
-- Two ADD COLUMNs in ONE ALTER, per CLAUDE.md section 6: MySQL/TiDB DDL is not
-- transactional, so separate statements can leave the first applied, the
-- migration unrecorded, and a re-run failing on "Duplicate column name". The
-- clients columns are a SECOND migration (0161) rather than a second statement
-- here, for the same reason: one statement per migration means a failure is
-- always recorded truthfully in the ledger.
--
-- MIGRATE BEFORE THE CODE MERGES. Drizzle names every column declared in
-- schema.ts in every bare select() and insert(), so the moment schema.ts
-- carries these the app asks the database for them. `tenants` has one bare
-- select — stripeConnectAccounts.ts — plus inserts in salonProvisioning and
-- salonSignup, and those are what break if the code lands first.
ALTER TABLE `tenants`
  ADD COLUMN `rebook_reminder_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `rebook_reminder_weeks_before` INT NOT NULL DEFAULT 3;

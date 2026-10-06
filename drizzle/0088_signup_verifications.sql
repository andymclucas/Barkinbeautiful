-- Proving an email address before a salon exists.
--
-- /signup is the only public endpoint in the system that creates a
-- TENANT, which makes it the one worth attacking: a script could sit on
-- it and fill the database with salons nobody asked for. The limit it
-- carried was three per address per hour, held in memory, and gone on
-- the next deploy.
--
-- So a code is sent to the address first and nothing is created until it
-- comes back. A flood now needs a mailbox per salon, which is a
-- different kind of effort entirely.
--
-- The code is HASHED, like a password reset token. These rows are not
-- credentials for an account that exists, but the code is briefly enough
-- to create one, and a leaked table of live codes is a leaked table of
-- live codes.
--
-- attempts is the other half: without it a six-digit code is a million
-- guesses, which is nothing. Five wrong and the row is spent.
--
-- One row per address, replaced on each request, so asking again simply
-- supersedes the last code rather than leaving a trail of valid ones.
CREATE TABLE IF NOT EXISTS `signup_verifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `verified_at` timestamp NULL,
  `requested_from` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `signup_verifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_signup_verifications_email` UNIQUE(`email`),
  INDEX `idx_signup_verifications_expires` (`expires_at`)
);
--> statement-breakpoint

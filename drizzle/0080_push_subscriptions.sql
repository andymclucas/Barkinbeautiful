-- Web Push subscriptions: one row per staff member per device.
--
-- This is what makes a notification arrive when Groomigo is closed. Until
-- now the only path was the browser's own Notification API fired from an
-- open page over an SSE connection, so a phone with the app shut had no
-- way to hear about an incoming call at all.
--
-- A subscription is per DEVICE, not per person: Andy's phone, Andy's
-- laptop and the salon screen are three rows for one user, and revoking
-- one must not touch the others. user_agent is stored so a device is
-- recognisable in a list when someone needs to.
--
-- The endpoint is a URL at Google/Apple/Mozilla and can be long, so it is
-- held as TEXT and uniqueness is enforced on a sha256 of it instead. A
-- unique index on the URL itself would be at the mercy of TiDB's index
-- key length limit; a char(64) hash never is. Re-subscribing the same
-- device must update that row rather than add a second one, or every send
-- notifies the same phone twice.
--
-- failure_count and last_failure_at exist because a subscription dies
-- quietly. 404 and 410 from the push service mean gone for good and the
-- row is deleted; everything else is transient and must be kept, so these
-- two columns are the only way to see a device that has been failing for
-- a fortnight without anyone noticing.
--
-- One statement, with a drizzle breakpoint: TiDB refuses a multi-statement
-- batch and its DDL is not transactional. IF NOT EXISTS so a re-run after
-- a partial failure is a no-op rather than a duplicate-table error.

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `endpoint` text NOT NULL,
  `endpoint_hash` char(64) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `user_agent` varchar(255) NULL,
  `last_success_at` timestamp NULL,
  `last_failure_at` timestamp NULL,
  `failure_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_push_subscriptions_endpoint` UNIQUE(`endpoint_hash`),
  INDEX `idx_push_subs_tenant` (`tenant_id`),
  INDEX `idx_push_subs_user` (`user_id`)
);
--> statement-breakpoint

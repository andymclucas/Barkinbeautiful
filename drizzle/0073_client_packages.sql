-- One client's purchase of a package.
--
-- credits_total is copied from the package at purchase, not joined: the
-- salon changing "5 baths" to "4 baths" next year must not retroactively
-- take a credit off someone who already paid for five. Same reasoning as
-- agreement versions.
CREATE TABLE `client_packages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `client_id` int NOT NULL,
  `package_id` int NOT NULL,
  `package_name` varchar(200) NOT NULL,
  `credits_total` int NOT NULL,
  `credits_used` int NOT NULL DEFAULT 0,
  `price_paid` decimal(10,2) NOT NULL,
  `purchased_at` timestamp NOT NULL DEFAULT (now()),
  `expires_at` timestamp NULL,
  `status` enum('active','used_up','expired','cancelled') NOT NULL DEFAULT 'active',
  `sold_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_packages_id` PRIMARY KEY(`id`)
);

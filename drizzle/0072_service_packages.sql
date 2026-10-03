-- A block of grooms bought up front: "5 baths for $200".
--
-- Distinct from a membership, which bills on a cycle and never runs out.
-- A package is a finite number of credits with an optional expiry, so the
-- money is taken once and drawn down.
CREATE TABLE `service_packages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `name` varchar(200) NOT NULL,
  `description` text,
  `service_type` varchar(64),
  `credits` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `valid_for_weeks` int,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `service_packages_id` PRIMARY KEY(`id`)
);

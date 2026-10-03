-- What the client thought, which is not the same as grooming_reports —
-- that is the groomer's assessment of the dog's coat and is already a
-- table. This is the salon's star rating from the client's side.
CREATE TABLE `client_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `client_id` int NOT NULL,
  `appointment_id` int,
  `rating` int NOT NULL,
  `comment` text,
  `source` enum('portal','staff_entered','imported') NOT NULL DEFAULT 'staff_entered',
  `published` boolean NOT NULL DEFAULT false,
  `recorded_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_reviews_id` PRIMARY KEY(`id`)
);

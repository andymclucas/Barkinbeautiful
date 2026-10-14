-- One dog on a sign-up request, with the membership it was quoted at.
--
-- A separate table rather than JSON on the request because the approval
-- screen lists dogs, the quote totals them, and a membership row is
-- created per dog — all of which are queries, not a blob to parse.
--
-- The package is stored by id AND by the fields it resolved to. The id
-- alone is not enough: "plan:7" is a row on the Pricing screen that the
-- salon can rename, reprice or deactivate between the client asking and
-- a staff member approving, and the record of what was offered has to
-- survive that. The id is kept so approval can re-resolve and notice.
--
-- `weight_kg` is what the CLIENT typed. It is the number that chose the
-- price band and it is the single most likely thing to be wrong on the
-- form, so it is stored as given and shown to whoever approves — not
-- quietly reconciled against pets.weight_kg, which may itself be blank.
--
-- `membership_id` is null until approval creates the membership, and is
-- what makes a second approval of the same request a no-op rather than a
-- second subscription.
CREATE TABLE IF NOT EXISTS `membership_signup_request_pets` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `request_id` INT NOT NULL,
  `tenant_id` INT NOT NULL,
  `pet_id` INT NOT NULL,
  `weight_kg` DECIMAL(5,2) NOT NULL,
  `package_id` VARCHAR(64) NOT NULL,
  `package_name` VARCHAR(255) NOT NULL,
  `tier` VARCHAR(32) NOT NULL,
  `service_type` VARCHAR(32) NOT NULL,
  `weekly_price` DECIMAL(10,2) NOT NULL,
  `interval_weeks` INT NOT NULL,
  `membership_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `membership_signup_request_pets_id` PRIMARY KEY(`id`),
  INDEX `idx_msrp_request` (`request_id`),
  INDEX `idx_msrp_tenant` (`tenant_id`)
);

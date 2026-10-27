-- Which dogs a membership actually covers.
--
-- `memberships.pet_id` holds exactly ONE dog, but 27 of the salon's 151
-- active plans are priced for a household — "Silver+ (x2)" at $58 a week
-- is two dogs, not two memberships at $58 each. Only the named dog was
-- ever linked, so the other dogs' grooms carry no membership at all:
-- they are counted as paying on the day panel, their subscription
-- revenue is missing from the membership figure, and 78 upcoming
-- bookings sit unlinked because nothing records that the plan covers
-- them.
--
-- A join table rather than more columns on `memberships`, because the
-- count is open-ended — the salon already writes "x3 DOGS" — and
-- because the dog a plan covers is a fact about the pair, not about
-- either one.
--
-- `memberships.pet_id` is deliberately NOT dropped. Every existing
-- query reads it, and a rename on a populated table in the middle of a
-- working day is how b848737 happened. It stays as the plan's primary
-- dog; this table is the full list, including that one, so "which dogs
-- does this plan cover" is a single query with nothing to reconcile.
--
-- No backfill here. The DDL ships on its own so the migration is
-- re-runnable and reviewable; the primary dog of every plan is copied
-- in by a separate, checkable script.

CREATE TABLE `membership_pets` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `tenant_id` INT NOT NULL,
  `membership_id` INT NOT NULL,
  `pet_id` INT NOT NULL,
  -- Who said this dog is on the plan, and when. A membership covering a
  -- dog is a money decision, so it carries the same accountability as
  -- the rest of the ledger rather than appearing from nowhere.
  `added_by_user_id` INT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `membership_pets_id` PRIMARY KEY(`id`),
  -- One row per dog per plan. Ticking the same dog twice is a no-op
  -- rather than a second claim on the same fee.
  CONSTRAINT `uq_membership_pets` UNIQUE(`membership_id`,`pet_id`)
);

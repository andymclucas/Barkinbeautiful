-- Attribution and follow-through for a review left on a grooming card.
--
-- `staff_id` is the groomer the review is ABOUT, captured when the review is
-- written rather than derived later: the appointment's groomer can be
-- reassigned afterwards, and a review should stay attached to whoever
-- actually did the dog.
--
-- `public_review_opened_at` records that a happy client clicked through to
-- leave a public review. It cannot know whether they finished — nobody can,
-- Google does not tell us — so it is named for what it actually observes.
ALTER TABLE `client_reviews`
  ADD COLUMN `staff_id` INT NULL,
  ADD COLUMN `public_review_opened_at` TIMESTAMP NULL;

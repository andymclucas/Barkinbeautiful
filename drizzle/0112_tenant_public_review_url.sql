-- Where to send a happy client to leave a PUBLIC review.
--
-- Usually a Google Business review link. Null means the salon has not set one
-- up, and the card then thanks the client and stops rather than sending them
-- somewhere broken.
ALTER TABLE `tenants`
  ADD COLUMN `public_review_url` VARCHAR(500) NULL;

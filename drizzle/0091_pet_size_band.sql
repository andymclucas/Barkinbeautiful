-- A size band for each dog, and where it came from.
--
-- Two columns in ONE ALTER: MySQL/TiDB DDL is not transactional, so two
-- statements can leave the first applied, the migration unrecorded, and a
-- re-run failing on "Duplicate column name".
--
-- This is deliberately NOT pets.weight_kg. MoeGo puts no weight in any
-- export available to us; what it does carry is the band, spelled out in the
-- service name ("...SML-10kg-Full Groom Classic"). A dog in the 17-25 kg
-- band has not been weighed, and writing 21 kg onto weight_kg would turn a
-- guess into something the app treats as measured — weight_kg drives the
-- automatic groom duration and is shown to staff as fact.
--
-- The band ids match MEMBERSHIP_WEIGHT_BANDS in shared/membershipPackages.ts
-- so the salon has one size vocabulary, not two.
--
-- size_band_source records how it was decided, so a band derived from a
-- service name can be re-derived safely while one a groomer set by hand is
-- never overwritten by an import.
ALTER TABLE `pets`
  ADD COLUMN `size_band` enum('small','small_medium','medium','large','extra_large','giant') NULL,
  ADD COLUMN `size_band_source` varchar(32) NULL;

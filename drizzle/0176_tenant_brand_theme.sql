-- Which colours the staff app wears: Groomigo's own teal, or the salon's.
--
-- NULL means Groomigo, which is the default every salon starts on. The
-- salon's saved brand colours (brand_primary, brand_accent, brand_sidebar)
-- are only painted once this holds 'brand'. Andy, 24/11/2026.
--
-- Nullable with no default, so code that does not know the column yet keeps
-- inserting tenants without it. Apply BEFORE the code that reads it merges.
ALTER TABLE `tenants` ADD `brand_theme` varchar(16);

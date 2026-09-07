ALTER TABLE `appointments` MODIFY COLUMN `service_type` enum('classic_groom','styled_groom','bath_only','fft','nail_trim','daycare','deshed','other') NOT NULL DEFAULT 'classic_groom';

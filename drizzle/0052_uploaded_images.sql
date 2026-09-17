CREATE TABLE `uploaded_images` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `storage_key` varchar(255) NOT NULL,
  `photo_data` mediumtext NOT NULL,
  `photo_content_type` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_uploaded_images_key` (`storage_key`)
);

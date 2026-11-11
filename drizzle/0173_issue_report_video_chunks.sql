-- Video attached to a staff problem report (stage 2, 11/11/2026).
--
-- There is no file storage configured for this app (no S3 client, no
-- bucket), so like every photo here the bytes live in the database — but a
-- video is far bigger than TiDB's ~6 MB per-row limit, so it is stored in
-- pieces of at most 3 MB (about 4 MB once base64-encoded), one row each,
-- and served back by stitching them together, byte ranges included so a
-- phone can scrub through it.
--
-- video_key is the same kind of key the report's attachment list holds
-- ("issue-reports/video-…"). (video_key, seq) is unique, so a retried
-- upload of the same piece cannot store it twice.
--
-- A new table: no existing query names it, so it is deploy-order-safe.
CREATE TABLE `issue_report_video_chunks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `video_key` VARCHAR(255) NOT NULL,
  `seq` INT NOT NULL,
  `total` INT NOT NULL,
  `content_type` VARCHAR(40) NOT NULL,
  `byte_length` INT NOT NULL,
  `data` MEDIUMTEXT NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_issue_video_chunk` (`video_key`, `seq`)
);

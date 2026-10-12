-- Anything already read had its first read then, by that person. Without this
-- the audit would start empty and every historic voicemail would look as if
-- nobody had ever opened it.
UPDATE `missed_calls`
  SET `first_read_at` = `read_at`, `first_read_by_user_id` = `read_by_user_id`
  WHERE `read_at` IS NOT NULL AND `first_read_at` IS NULL;

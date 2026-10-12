UPDATE `sms_logs`
  SET `first_read_at` = `read_at`, `first_read_by_user_id` = `read_by_user_id`
  WHERE `read_at` IS NOT NULL AND `first_read_at` IS NULL;

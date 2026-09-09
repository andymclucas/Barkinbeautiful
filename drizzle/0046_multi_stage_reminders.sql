ALTER TABLE `appointments`
  ADD `reminder_4d_sent_at` timestamp,
  ADD `reminder_2d_sent_at` timestamp,
  ADD `reminder_morning_sent_at` timestamp;

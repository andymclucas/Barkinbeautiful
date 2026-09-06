ALTER TABLE `sms_logs` MODIFY COLUMN `type` enum('reminder','confirmation','ready_pickup','payment_failed','tracker','custom','campaign','inbound') NOT NULL DEFAULT 'custom';
ALTER TABLE `sms_logs` MODIFY COLUMN `type` enum('reminder','confirmation','ready_pickup','payment_failed','tracker','custom','campaign','inbound') NOT NULL DEFAULT 'custom';

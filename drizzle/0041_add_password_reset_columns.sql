ALTER TABLE `users` ADD `passwordResetTokenHash` varchar(255);
ALTER TABLE `users` ADD `passwordResetExpiresAt` timestamp;

-- One invoice covering several appointments.
--
-- Lauren, 23/10/2026: "how do I invoice a total double dog invoice?" She
-- could not — Create Bills raises one invoice per dog, so a two-dog
-- booking produced two bills for one household paying once.
--
-- `invoices.appointment_id` is a single column and cannot express it.
-- It STAYS: every existing invoice uses it, and the check that stops a
-- booking being billed twice reads it. This table is additive, and from
-- now on it is the authority on which appointments an invoice covers —
-- a single-dog invoice gets one row here as well, so the duplicate
-- check has one place to look.
--
-- Backfilled by scripts/backfill-invoice-appointments.ts, which is
-- idempotent and must be run before any combined invoice is raised.
CREATE TABLE `invoice_appointments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `invoice_id` INT NOT NULL,
  `appointment_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `uq_invoice_appt` (`invoice_id`, `appointment_id`),
  -- The duplicate-bill check asks "is this appointment on any invoice?",
  -- so it leads with appointment_id.
  INDEX `idx_invoice_appt_appointment` (`appointment_id`),
  INDEX `idx_invoice_appt_tenant` (`tenant_id`)
);

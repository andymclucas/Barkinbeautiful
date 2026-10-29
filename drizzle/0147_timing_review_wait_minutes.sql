-- A configurable ceiling on the wait between drop-off and the start of
-- a bath. The four existing thresholds all measure how long a STAGE
-- took; none measured the queue in front of one, so on 29/10/2026 every
-- bath ran 13-33 minutes, inside every threshold, while dogs sat up to
-- 2h30 waiting for one.
--
-- 90 minutes, from 841 measured waits over 34 trading days: median 44,
-- p90 112. At 90 it flags 19% of dogs; at 30 it would flag 61% and read
-- as noise. It is the same figure as bath_minutes, and is editable per
-- salon, per pet size and per breed in Settings.
--
-- NOT NULL with a DEFAULT so that rows written by code that predates
-- this column stay valid, and one statement so a failure is recorded
-- truthfully in the ledger.
ALTER TABLE `workflow_timing_review_thresholds`
  ADD COLUMN `wait_minutes` INT NOT NULL DEFAULT 90;

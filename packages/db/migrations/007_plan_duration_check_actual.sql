ALTER TABLE plans
  ADD COLUMN duration_minutes INT NULL AFTER description;

ALTER TABLE checks
  ADD COLUMN actual_minutes INT NULL AFTER done;

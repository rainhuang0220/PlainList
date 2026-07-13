ALTER TABLE plans
  ADD COLUMN scheduled_date DATE NULL AFTER time;

UPDATE plans
SET scheduled_date = DATE(created_at)
WHERE type = 'todo' AND scheduled_date IS NULL;

CREATE INDEX idx_plans_user_scheduled ON plans (user_id, scheduled_date);

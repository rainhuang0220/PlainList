CREATE TABLE IF NOT EXISTS duration_chart_prefs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  scope ENUM('week','month','year') NOT NULL,
  scope_key VARCHAR(32) NOT NULL,
  hidden_plan_ids JSON NOT NULL,
  merges JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_scope (user_id, scope, scope_key),
  CONSTRAINT fk_dcp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

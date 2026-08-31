CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('habit', 'todo') NOT NULL DEFAULT 'habit',
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  duration_minutes INT NULL,
  time CHAR(5) NOT NULL DEFAULT '09:00',
  scheduled_date DATE NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_plans_user (user_id),
  INDEX idx_plans_user_scheduled (user_id, scheduled_date),
  CONSTRAINT fk_plans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  check_date DATE NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  actual_minutes INT NULL,
  UNIQUE KEY uk_plan_date (plan_id, check_date),
  INDEX idx_checks_date (check_date),
  CONSTRAINT fk_checks_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  review_date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, review_date),
  INDEX idx_reviews_user_date (user_id, review_date),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  key_name VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_key (user_id, key_name),
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profile_traits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  trait_key VARCHAR(120) NOT NULL,
  title VARCHAR(160) NOT NULL,
  generated_summary TEXT NOT NULL,
  user_summary TEXT NULL,
  impact_ratio DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  support_count INT UNSIGNED NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_evidence_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_profile_user_trait (user_id, trait_key),
  INDEX idx_profile_traits_user_enabled (user_id, enabled),
  CONSTRAINT fk_profile_traits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profile_evidence (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trait_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  review_date DATE NOT NULL,
  excerpt TEXT NOT NULL,
  observation TEXT NOT NULL,
  impact_note VARCHAR(280) NOT NULL,
  weight DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_profile_evidence_source (trait_id, source_hash),
  INDEX idx_profile_evidence_user_date (user_id, review_date),
  CONSTRAINT fk_profile_evidence_trait FOREIGN KEY (trait_id) REFERENCES user_profile_traits(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_evidence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profile_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status ENUM('success', 'failed') NOT NULL,
  model VARCHAR(120) NULL,
  message VARCHAR(500) NULL,
  evidence_count INT UNSIGNED NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_profile_runs_user_date (user_id, analyzed_at),
  CONSTRAINT fk_profile_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- See migrations/009_activity_knowledge_core.sql for the additive Activity
-- Knowledge tables. Kept here so a fresh schema matches the migration chain.
CREATE TABLE IF NOT EXISTS activity_goals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL, description TEXT NULL, priority_rank SMALLINT UNSIGNED NOT NULL,
  time_horizon ENUM('near_term','medium_term','long_term') NOT NULL,
  status ENUM('active','paused','achieved','archived') NOT NULL DEFAULT 'active', domain VARCHAR(80) NULL,
  success_signals JSON NOT NULL, anti_goals JSON NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_activity_goals_user_status_rank (user_id, status, priority_rank),
  CONSTRAINT fk_activity_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, source_type VARCHAR(48) NOT NULL,
  external_id VARCHAR(255) NULL, idempotency_key VARCHAR(128) NOT NULL, date_start DATE NOT NULL, date_end DATE NOT NULL,
  occurred_at DATETIME(3) NULL, schema_version VARCHAR(40) NOT NULL, compact_payload JSON NULL, content_hash CHAR(64) NOT NULL,
  status ENUM('active','deleted') NOT NULL DEFAULT 'active', deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_activity_sources_user_idempotency (user_id, source_type, idempotency_key), INDEX idx_activity_sources_user_external (user_id, source_type, external_id),
  CONSTRAINT fk_activity_sources_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_facts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, source_id BIGINT UNSIGNED NOT NULL, date_key DATE NOT NULL,
  fact_key VARCHAR(120) NOT NULL, category VARCHAR(48) NOT NULL, title VARCHAR(240) NOT NULL, summary VARCHAR(600) NOT NULL, outcome VARCHAR(600) NULL,
  progress_state ENUM('advanced','maintained','blocked','not_observed','unknown') NOT NULL DEFAULT 'unknown', output_state ENUM('produced','partial','not_applicable','unknown') NOT NULL DEFAULT 'unknown', exploration_state ENUM('explored','not_applicable','unknown') NOT NULL DEFAULT 'unknown',
  related_goal_ids JSON NOT NULL, evidence JSON NOT NULL, confidence ENUM('high','medium','low') NOT NULL DEFAULT 'medium', input_hash CHAR(64) NOT NULL, fact_hash CHAR(64) NOT NULL, extractor_version VARCHAR(40) NOT NULL, provider VARCHAR(120) NULL, model VARCHAR(200) NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_activity_facts_source_key (source_id, fact_key), INDEX idx_activity_facts_user_date (user_id, date_key),
  CONSTRAINT fk_activity_facts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, CONSTRAINT fk_activity_facts_source FOREIGN KEY (source_id) REFERENCES activity_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_activity_digests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, date_key DATE NOT NULL,
  status ENUM('generating','ready','dirty','failed') NOT NULL DEFAULT 'dirty', input_hash CHAR(64) NULL, prompt_version VARCHAR(40) NULL, schema_version VARCHAR(40) NULL, content JSON NULL, evidence_fact_ids JSON NULL, provider VARCHAR(120) NULL, model VARCHAR(200) NULL, input_tokens INT UNSIGNED NULL, output_tokens INT UNSIGNED NULL, error_code VARCHAR(80) NULL, generated_at TIMESTAMP NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_daily_activity_digests_user_date (user_id, date_key), CONSTRAINT fk_daily_activity_digests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_activity_intelligence (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, week_start DATE NOT NULL, source_date_from DATE NOT NULL, source_date_to DATE NOT NULL,
  status ENUM('generating','ready','dirty','failed') NOT NULL DEFAULT 'dirty', input_hash CHAR(64) NULL, goal_profile_hash CHAR(64) NULL, prompt_version VARCHAR(40) NULL, schema_version VARCHAR(40) NULL, content JSON NULL, evidence_daily_dates JSON NULL, evidence_fact_ids JSON NULL, provider VARCHAR(120) NULL, model VARCHAR(200) NULL, input_tokens INT UNSIGNED NULL, output_tokens INT UNSIGNED NULL, error_code VARCHAR(80) NULL, generated_at TIMESTAMP NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_weekly_activity_intelligence_user_week (user_id, week_start), INDEX idx_weekly_activity_intelligence_user_range (user_id, source_date_from, source_date_to),
  CONSTRAINT fk_weekly_activity_intelligence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_review_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  review_as_of_date DATE NOT NULL,
  window_start_date DATE NOT NULL,
  window_end_date DATE NOT NULL,
  status ENUM('pending', 'generating', 'ready', 'error') NOT NULL DEFAULT 'pending',
  attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  claim_token CHAR(36) NULL,
  lease_expires_at DATETIME(3) NULL,
  content_json JSON NULL,
  evidence_json JSON NULL,
  evidence_hash CHAR(64) NULL,
  provider VARCHAR(32) NULL,
  model VARCHAR(160) NULL,
  prompt_version VARCHAR(80) NULL,
  error_message VARCHAR(500) NULL,
  generated_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_weekly_review_snapshot_user_as_of (user_id, review_as_of_date),
  INDEX idx_weekly_review_snapshot_user_status_date (user_id, status, review_as_of_date),
  CONSTRAINT fk_weekly_review_snapshot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

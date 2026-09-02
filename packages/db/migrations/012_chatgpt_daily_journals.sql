CREATE TABLE IF NOT EXISTS chatgpt_daily_journals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  journal_date DATE NOT NULL,
  source_type VARCHAR(48) NOT NULL DEFAULT 'chatgpt-local-sync',
  status ENUM('dirty', 'ready', 'final', 'failed') NOT NULL DEFAULT 'ready',
  summary_markdown MEDIUMTEXT NOT NULL,
  activity_count INT UNSIGNED NOT NULL DEFAULT 0,
  conversation_count INT UNSIGNED NOT NULL DEFAULT 0,
  source_version VARCHAR(40) NOT NULL,
  generated_at DATETIME(3) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chatgpt_journal_user_date_source (user_id, journal_date, source_type),
  INDEX idx_chatgpt_journal_user_date (user_id, journal_date),
  CONSTRAINT fk_chatgpt_journal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatgpt_activity_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  source_type VARCHAR(48) NOT NULL DEFAULT 'chatgpt-local-sync',
  connection_status ENUM('connected', 'paused', 'unavailable') NOT NULL DEFAULT 'connected',
  last_synced_at DATETIME(3) NULL,
  checked_count INT UNSIGNED NOT NULL DEFAULT 0,
  changed_count INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chatgpt_connection_user_source (user_id, source_type),
  CONSTRAINT fk_chatgpt_connection_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

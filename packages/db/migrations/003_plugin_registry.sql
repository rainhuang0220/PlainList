-- Plugin marketplace registry tables

CREATE TABLE IF NOT EXISTS plugins (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'widget',
  author VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  long_description TEXT,
  icon_url VARCHAR(500),
  repo_url VARCHAR(500),
  homepage_url VARCHAR(500),
  license VARCHAR(50) DEFAULT 'MIT',
  tags JSON,
  capabilities JSON,
  is_official TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_plugins_category (category),
  INDEX idx_plugins_published (is_published),
  INDEX idx_plugins_downloads (download_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plugin_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plugin_id VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  changelog TEXT,
  manifest JSON NOT NULL,
  archive_url VARCHAR(500),
  archive_sha256 VARCHAR(64),
  min_app_version VARCHAR(32),
  is_latest TINYINT(1) NOT NULL DEFAULT 0,
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plugin_version (plugin_id, version),
  INDEX idx_versions_latest (plugin_id, is_latest),
  CONSTRAINT fk_versions_plugin FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_plugins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  plugin_id VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  settings JSON,
  installed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_plugin (user_id, plugin_id),
  INDEX idx_user_plugins_user (user_id),
  CONSTRAINT fk_user_plugins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_plugins_plugin FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

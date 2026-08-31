import fs from 'node:fs/promises';
import path from 'node:path';
import { runPendingMigrations } from './migrationRunner';
import { createPool, ensureDatabaseExists, loadDatabaseConfig } from './utils';

async function main(): Promise<void> {
  const config = loadDatabaseConfig();
  await ensureDatabaseExists(config);

  const pool = createPool(config);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const migrationsDir = path.resolve(__dirname, 'migrations');
    await runPendingMigrations(await fs.readdir(migrationsDir), {
      isApplied: async (filename) => {
        const [rows] = await pool.query('SELECT id FROM schema_migrations WHERE filename = ?', [filename]);
        return Array.isArray(rows) && rows.length > 0;
      },
      readMigration: (filename) => fs.readFile(path.join(migrationsDir, filename), 'utf8'),
      applyMigration: async (filename, sql) => {
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
        console.log(`Applied migration ${filename}`);
      },
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database migration failed:', error);
  process.exit(1);
});

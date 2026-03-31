import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

function resolveEnvPath(): string | null {
  const candidates = [
    process.env.PLAINLIST_ENV_FILE,
    path.resolve(__dirname, '../../apps/api/.env'),
    path.resolve(__dirname, '../../apps/api/.env.example'),
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function loadDatabaseConfig(): DatabaseConfig {
  const envPath = resolveEnvPath();
  if (envPath) {
    dotenv.config({ path: envPath });
  }

  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'plainlist',
    password: process.env.DB_PASS ?? '',
    database: process.env.DB_NAME ?? 'plainlist',
  };
}

export async function ensureDatabaseExists(config: DatabaseConfig): Promise<void> {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}

export function createPool(config: DatabaseConfig): mysql.Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
  });
}

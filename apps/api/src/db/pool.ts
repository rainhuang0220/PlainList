import mysql from 'mysql2/promise';
import { env } from '../config/env';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  // Return DATE columns as 'YYYY-MM-DD' strings. Without this, mysql2 converts
  // them to local-midnight Date objects, and any toISOString() call shifts the
  // day (e.g. 2026-07-03 becomes 2026-07-02T16:00:00Z in UTC+8).
  dateStrings: ['DATE'],
});

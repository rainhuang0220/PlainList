import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('plainlist'),
  DB_PASS: z.string().default(''),
  DB_NAME: z.string().default('plainlist'),
  JWT_SECRET: z.string().default('change-me-in-production'),
});

export const env = envSchema.parse(process.env);

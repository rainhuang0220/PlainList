import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), 'apps/api/.env'),
  path.resolve(process.cwd(), '.env'),
].filter((candidate, index, all) => all.indexOf(candidate) === index);

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
}

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('plainlist'),
  DB_PASS: z.string().default(''),
  DB_NAME: z.string().default('plainlist'),
  JWT_SECRET: z.string().default('change-me-in-production'),
  AI_REVIEW_BASE_URL: z.string().url().default('https://api.siliconflow.cn/v1'),
  AI_REVIEW_API_KEY: z.string().default(''),
  AI_REVIEW_MODEL: z.string().default('deepseek-ai/DeepSeek-V3.1-Terminus'),
  AI_REVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

export const env = envSchema.parse(process.env);

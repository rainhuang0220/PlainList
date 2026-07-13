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
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  AI_REVIEW_BASE_URL: z.string().url().default('https://api.siliconflow.cn/v1'),
  AI_REVIEW_API_KEY: z.string().default(''),
  AI_REVIEW_MODEL: z.string().default('deepseek-ai/DeepSeek-V3.1-Terminus'),
  AI_INTAKE_MODEL: z.string().optional().default(''),
  AI_REVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_ANTHROPIC_VERSION: z.string().default('2023-06-01'),
  // 新用户 AI 速记默认 Key：注册时自动写入 user_settings（不入 git，仅服务端 .env）
  AI_USER_DEFAULT_API_KEY: z.string().optional().default(''),
  AI_USER_DEFAULT_BASE_URL: z.string().optional().default(''),
  AI_USER_DEFAULT_MODEL: z.string().optional().default(''),
  AI_USER_DEFAULT_INTAKE_MODEL: z.string().optional().default(''),
  AI_USER_DEFAULT_PROVIDER: z.string().optional().default(''),
  AUDIT_LOG_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  AUDIT_LOG_PATH: z.string().optional(),
  TRUST_PROXY: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  CORS_ORIGINS: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);

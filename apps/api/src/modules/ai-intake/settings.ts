import type { AiProvider, AiUserSettings, AiUserSettingsView } from '@plainlist/shared';
import { USER_SETTING_KEYS, aiUserSettingsSchema } from '@plainlist/shared';
import { env } from '../../config/env';
import { pool } from '../../db/pool';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function getUserSetting(userId: number, keyName: string): Promise<string | null> {
  const [rows] = await pool.query('SELECT value FROM user_settings WHERE user_id = ? AND key_name = ?', [userId, keyName]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return String((rows[0] as { value: string }).value);
}

export async function setUserSetting(userId: number, keyName: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key_name, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, keyName, value],
  );
}

/**
 * 新用户 AI 速记默认配置。
 * 若 `AI_USER_DEFAULT_API_KEY` 为空 → 返回 null（不预置，走服务端 .env 兜底）。
 * 否则返回按 env 组装的完整 AiUserSettings，注册 / seed 时调用 `seedDefaultAiSettings()` 写入。
 */
export function getDefaultAiSettings(): AiUserSettings | null {
  const apiKey = env.AI_USER_DEFAULT_API_KEY.trim();
  if (!apiKey) {
    return null;
  }

  const providerRaw = env.AI_USER_DEFAULT_PROVIDER.trim();
  const provider: AiProvider = providerRaw === 'anthropic' ? 'anthropic' : 'openai';
  const baseUrl = env.AI_USER_DEFAULT_BASE_URL.trim() || env.AI_REVIEW_BASE_URL;
  const model = env.AI_USER_DEFAULT_MODEL.trim() || env.AI_REVIEW_MODEL;
  const intakeModel = env.AI_USER_DEFAULT_INTAKE_MODEL.trim();

  return {
    provider,
    baseUrl,
    model,
    intakeModel,
    apiKey,
    timeoutMs: env.AI_REVIEW_TIMEOUT_MS,
    anthropicVersion: provider === 'anthropic' ? env.AI_ANTHROPIC_VERSION : undefined,
  };
}

export async function seedDefaultAiSettings(userId: number): Promise<boolean> {
  const defaults = getDefaultAiSettings();
  if (!defaults) {
    return false;
  }

  await setUserSetting(userId, USER_SETTING_KEYS.aiSettings, JSON.stringify(defaults));
  return true;
}

function isPlaceholderKey(key: string): boolean {
  const trimmed = key.trim();
  return !trimmed || trimmed === 'your-api-key';
}

export interface ResolvedAiConfig {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  anthropicVersion: string;
  source: 'user' | 'server' | 'none';
}

function maskApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed || isPlaceholderKey(trimmed)) {
    return null;
  }

  if (trimmed.length <= 8) {
    return '****';
  }

  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function serverEnvConfig(): ResolvedAiConfig | null {
  const apiKey = env.AI_REVIEW_API_KEY.trim();
  if (isPlaceholderKey(apiKey)) {
    return null;
  }

  return {
    provider: env.AI_PROVIDER,
    baseUrl: env.AI_REVIEW_BASE_URL,
    model: env.AI_REVIEW_MODEL,
    apiKey,
    timeoutMs: env.AI_REVIEW_TIMEOUT_MS,
    anthropicVersion: env.AI_ANTHROPIC_VERSION,
    source: 'server',
  };
}

export async function loadUserAiSettings(userId: number): Promise<AiUserSettings | null> {
  const raw = await getUserSetting(userId, USER_SETTING_KEYS.aiSettings);
  if (!raw) {
    return null;
  }

  try {
    const parsed = aiUserSettingsSchema.parse(JSON.parse(raw));
    return {
      provider: parsed.provider,
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      intakeModel: parsed.intakeModel ?? '',
      apiKey: parsed.apiKey ?? '',
      timeoutMs: parsed.timeoutMs,
      anthropicVersion: parsed.anthropicVersion,
    };
  } catch {
    return null;
  }
}

export function resolveAiConfig(userSettings: AiUserSettings | null): ResolvedAiConfig | null {
  const userKey = userSettings?.apiKey?.trim() ?? '';
  if (userSettings && !isPlaceholderKey(userKey)) {
    return {
      provider: userSettings.provider,
      baseUrl: userSettings.baseUrl,
      model: userSettings.model,
      apiKey: userKey,
      timeoutMs: userSettings.timeoutMs,
      anthropicVersion: userSettings.anthropicVersion ?? env.AI_ANTHROPIC_VERSION,
      source: 'user',
    };
  }

  return serverEnvConfig();
}

export function aiConfigIsReady(config: ResolvedAiConfig | null): config is ResolvedAiConfig {
  return Boolean(config && !isPlaceholderKey(config.apiKey));
}

export function resolveIntakeModel(
  userSettings: Pick<AiUserSettings, 'intakeModel'> | null,
  base: ResolvedAiConfig,
): string {
  const userIntake = userSettings?.intakeModel?.trim() ?? '';
  if (userIntake) {
    return userIntake;
  }

  const serverIntake = env.AI_INTAKE_MODEL.trim();
  if (serverIntake) {
    return serverIntake;
  }

  return base.model;
}

export function resolveIntakeAiConfig(
  userSettings: AiUserSettings | null,
  base: ResolvedAiConfig | null,
): ResolvedAiConfig | null {
  if (!base) {
    return null;
  }

  return {
    ...base,
    model: resolveIntakeModel(userSettings, base),
  };
}

export async function getAiSettingsView(userId: number): Promise<AiUserSettingsView> {
  const stored = await loadUserAiSettings(userId);
  const effective = resolveAiConfig(stored);
  const userKey = stored?.apiKey?.trim() ?? '';
  const intakeModel = stored?.intakeModel?.trim() ?? '';
  const effectiveIntakeModel = effective
    ? resolveIntakeModel(stored, effective)
    : (env.AI_INTAKE_MODEL.trim() || env.AI_REVIEW_MODEL);

  if (stored) {
    return {
      provider: stored.provider,
      baseUrl: stored.baseUrl,
      model: stored.model,
      intakeModel,
      effectiveIntakeModel,
      timeoutMs: stored.timeoutMs,
      anthropicVersion: stored.anthropicVersion,
      apiKeyConfigured: !isPlaceholderKey(userKey),
      apiKeyPreview: maskApiKey(userKey),
      effectiveSource: effective?.source ?? 'none',
    };
  }

  const server = serverEnvConfig();
  return {
    provider: server?.provider ?? env.AI_PROVIDER,
    baseUrl: server?.baseUrl ?? env.AI_REVIEW_BASE_URL,
    model: server?.model ?? env.AI_REVIEW_MODEL,
    intakeModel: '',
    effectiveIntakeModel: server
      ? resolveIntakeModel(null, server)
      : (env.AI_INTAKE_MODEL.trim() || env.AI_REVIEW_MODEL),
    timeoutMs: server?.timeoutMs ?? env.AI_REVIEW_TIMEOUT_MS,
    anthropicVersion: server?.anthropicVersion ?? env.AI_ANTHROPIC_VERSION,
    apiKeyConfigured: Boolean(server),
    apiKeyPreview: server ? maskApiKey(server.apiKey) : null,
    effectiveSource: server ? 'server' : 'none',
  };
}

export async function saveAiSettings(userId: number, payload: unknown): Promise<AiUserSettingsView> {
  const incoming = aiUserSettingsSchema.parse(payload);
  const existing = await loadUserAiSettings(userId);

  let apiKey = incoming.apiKey?.trim() ?? '';
  if (!apiKey && existing?.apiKey) {
    apiKey = existing.apiKey;
  }

  const next: AiUserSettings = {
    provider: incoming.provider,
    baseUrl: incoming.baseUrl,
    model: incoming.model,
    intakeModel: incoming.intakeModel?.trim() ?? '',
    apiKey,
    timeoutMs: incoming.timeoutMs,
    anthropicVersion: incoming.anthropicVersion,
  };

  await setUserSetting(userId, USER_SETTING_KEYS.aiSettings, JSON.stringify(next));
  return getAiSettingsView(userId);
}

export async function clearUserAiSettings(userId: number): Promise<AiUserSettingsView> {
  await pool.query('DELETE FROM user_settings WHERE user_id = ? AND key_name = ?', [
    userId,
    USER_SETTING_KEYS.aiSettings,
  ]);
  return getAiSettingsView(userId);
}

export async function resolveAiConfigForUser(userId: number): Promise<ResolvedAiConfig | null> {
  const stored = await loadUserAiSettings(userId);
  return resolveAiConfig(stored);
}

export async function resolveIntakeAiConfigForUser(userId: number): Promise<ResolvedAiConfig | null> {
  const stored = await loadUserAiSettings(userId);
  return resolveIntakeAiConfig(stored, resolveAiConfig(stored));
}

export function assertAiConfigured(config: ResolvedAiConfig | null): ResolvedAiConfig {
  if (!aiConfigIsReady(config)) {
    throw serviceError(
      503,
      '未配置可用的大模型。请点击右上角用户名 → 用户设置 → AI 速记，填写 API Key；或由管理员在 apps/api/.env 配置服务端默认 Key。',
    );
  }

  return config;
}

/** AI 速记 prompt 长、输出多，至少等 3 分钟，避免连通测试通过但速记仍 504。 */
const AI_INTAKE_MIN_TIMEOUT_MS = 180_000;

export function resolveIntakeTimeout(configuredTimeoutMs: number): number {
  return Math.max(configuredTimeoutMs, AI_INTAKE_MIN_TIMEOUT_MS);
}

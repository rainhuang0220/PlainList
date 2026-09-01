import type {
  AuthenticatedUser,
  PlanRecord,
  WeeklySummaryContent,
  WeeklySummaryResponse,
} from '@plainlist/shared';
import {
  WEEKLY_SUMMARY_PROMPT_VERSION,
  toDateKey,
  weeklySummaryWeekStartSchema,
} from '@plainlist/shared';
import { pool } from '../../db/pool';
import { listChecks } from '../checks/service';
import { resolveAiConfigForUser } from '../ai-intake/settings';
import { aiProviderConfigured, chatComplete } from '../ai-shared/llm';
import { listUserProfile } from '../user-profile/service';
import { listReviews } from './service';
import {
  assembleWeeklyEvidence,
  buildWeeklySummarySystemPrompt,
  buildWeeklySummaryUserPrompt,
  isWeeklySummaryCacheFresh,
  normalizeWeekStart,
  parseWeeklySummaryContent,
  sourceHash,
  weeklyLookbackRange,
  weeklySummarySettingKey,
  type WeeklyEvidencePayload,
} from './weeklySummaryCore';

interface PlanRow {
  id: number;
  type: 'habit' | 'todo';
  name: string;
  description?: string | null;
  duration_minutes?: number | null;
  time: string;
  sort_order: number;
  scheduled_date?: string | Date | null;
  visible_from?: string | Date | null;
}

interface CachedWeeklySummary {
  weekStart: string;
  weekEnd: string;
  sourceHash: string;
  promptVersion: string;
  model: string | null;
  generatedAt: string;
  content: WeeklySummaryContent;
}

const PLAN_SELECT = `
  SELECT p.id, p.type, p.name, p.description, p.duration_minutes, p.time, p.sort_order, p.scheduled_date,
         DATE_FORMAT(LEAST(DATE(p.created_at), COALESCE(MIN(c.check_date), DATE(p.created_at))), '%Y-%m-%d') AS visible_from
  FROM plans p
  LEFT JOIN checks c ON c.plan_id = p.id
`;

function toLocalDateKey(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return toDateKey(value);
  }
  const text = String(value).slice(0, 10);
  return text || null;
}

function mapPlan(row: PlanRow): PlanRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description ?? null,
    durationMinutes: row.duration_minutes ?? null,
    time: row.time,
    sortOrder: row.sort_order,
    scheduledDate: row.type === 'todo' ? toLocalDateKey(row.scheduled_date) : null,
    visibleFrom: toLocalDateKey(row.visible_from),
  };
}

async function loadPlansReadOnly(userId: number): Promise<PlanRecord[]> {
  const [rows] = await pool.query(
    `${PLAN_SELECT} WHERE p.user_id = ? GROUP BY p.id ORDER BY p.time, p.sort_order`,
    [userId],
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => mapPlan(row as PlanRow));
}

async function readWeeklyCache(userId: number, weekStart: string): Promise<CachedWeeklySummary | null> {
  const [rows] = await pool.query(
    'SELECT value FROM user_settings WHERE user_id = ? AND key_name = ?',
    [userId, weeklySummarySettingKey(weekStart)],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(String((rows[0] as { value: string }).value)) as CachedWeeklySummary;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeWeeklyCache(userId: number, cache: CachedWeeklySummary): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key_name, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, weeklySummarySettingKey(cache.weekStart), JSON.stringify(cache)],
  );
}

function unavailable(
  weekStart: string,
  weekEnd: string,
  reason = '本期回顾暂不可用',
): WeeklySummaryResponse {
  return {
    status: 'unavailable',
    weekStart,
    weekEnd,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    reason,
  };
}

function readyResponse(
  cache: CachedWeeklySummary,
  cached: boolean,
): WeeklySummaryResponse {
  return {
    status: 'ready',
    weekStart: cache.weekStart,
    weekEnd: cache.weekEnd,
    promptVersion: cache.promptVersion,
    sourceHash: cache.sourceHash,
    model: cache.model,
    generatedAt: cache.generatedAt,
    cached,
    content: cache.content,
  };
}

async function collectEvidence(user: AuthenticatedUser, rawWeekStart: string): Promise<{
  weekStart: string;
  weekEnd: string;
  sourceHash: string;
  evidence: WeeklyEvidencePayload;
}> {
  const weekStart = normalizeWeekStart(rawWeekStart);
  const range = weeklyLookbackRange(weekStart);
  const [plans, checks, reviews, profile] = await Promise.all([
    loadPlansReadOnly(user.id),
    listChecks(user, { from: range.from, to: range.to }),
    listReviews(user, { from: range.from, to: range.to }),
    listUserProfile(user),
  ]);

  const evidence = assembleWeeklyEvidence({
    weekStart,
    todayKey: toDateKey(new Date()),
    plans,
    checks,
    reviews,
    profile: profile.traits,
  });

  return {
    weekStart,
    weekEnd: evidence.weekEnd,
    sourceHash: sourceHash(evidence),
    evidence,
  };
}

export async function getWeeklySummary(user: AuthenticatedUser, query: unknown): Promise<WeeklySummaryResponse> {
  const { weekStart: rawWeekStart } = weeklySummaryWeekStartSchema.parse(query);
  const collected = await collectEvidence(user, rawWeekStart);
  const cache = await readWeeklyCache(user.id, collected.weekStart);
  if (isWeeklySummaryCacheFresh(cache, {
    weekStart: collected.weekStart,
    sourceHash: collected.sourceHash,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
  }) && cache?.content) {
    return readyResponse(cache, true);
  }

  return {
    status: 'missing',
    weekStart: collected.weekStart,
    weekEnd: collected.weekEnd,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    sourceHash: collected.sourceHash,
  };
}

export async function generateWeeklySummary(user: AuthenticatedUser, payload: unknown): Promise<WeeklySummaryResponse> {
  const { weekStart: rawWeekStart } = weeklySummaryWeekStartSchema.parse(payload);
  const collected = await collectEvidence(user, rawWeekStart);
  const cache = await readWeeklyCache(user.id, collected.weekStart);
  if (isWeeklySummaryCacheFresh(cache, {
    weekStart: collected.weekStart,
    sourceHash: collected.sourceHash,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
  }) && cache?.content) {
    return readyResponse(cache, true);
  }

  const config = await resolveAiConfigForUser(user.id);
  if (!config || !aiProviderConfigured(config)) {
    return unavailable(collected.weekStart, collected.weekEnd);
  }

  try {
    const result = await chatComplete(config, {
      system: buildWeeklySummarySystemPrompt(),
      user: buildWeeklySummaryUserPrompt(collected.evidence),
      temperature: 0.2,
      maxTokens: 2500,
      jsonResponse: false,
      thinkingMode: 'disabled',
      timeoutMs: Math.max(config.timeoutMs, 60_000),
    });
    const content = parseWeeklySummaryContent(result.text);
    if (!content) {
      return unavailable(collected.weekStart, collected.weekEnd);
    }

    const nextCache: CachedWeeklySummary = {
      weekStart: collected.weekStart,
      weekEnd: collected.weekEnd,
      sourceHash: collected.sourceHash,
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      model: result.model,
      generatedAt: new Date().toISOString(),
      content,
    };
    await writeWeeklyCache(user.id, nextCache);
    return readyResponse(nextCache, false);
  } catch {
    return unavailable(collected.weekStart, collected.weekEnd);
  }
}

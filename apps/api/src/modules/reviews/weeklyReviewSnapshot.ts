import {
  createReviewClock,
  type AuthenticatedUser,
  type PlanRecord,
  type WeeklySummaryResponse,
  WEEKLY_SUMMARY_PROMPT_VERSION,
} from '@plainlist/shared';
import { env } from '../../config/env';
import { pool } from '../../db/pool';
import { listChecks } from '../checks/service';
import { resolveAiConfigForUser } from '../ai-intake/settings';
import { aiProviderConfigured, chatComplete } from '../ai-shared/llm';
import { listUserProfile } from '../user-profile/service';
import {
  assembleReviewSnapshotEvidence,
  buildWeeklySummarySystemPrompt,
  buildWeeklySummaryUserPrompt,
  parseWeeklySummaryContent,
  sourceHash,
  weeklyLookbackRange,
} from './weeklySummaryCore';
import { createReviewSnapshotCoordinator, type ReviewSnapshot } from './reviewSnapshotCoordinator';
import { createMysqlReviewSnapshotRepository } from './reviewSnapshotRepository';
import { listReviews } from './service';

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

const PLAN_SELECT = `
  SELECT p.id, p.type, p.name, p.description, p.duration_minutes, p.time, p.sort_order, p.scheduled_date,
         DATE_FORMAT(LEAST(DATE(p.created_at), COALESCE(MIN(c.check_date), DATE(p.created_at))), '%Y-%m-%d') AS visible_from
  FROM plans p LEFT JOIN checks c ON c.plan_id = p.id
`;

function localDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value).slice(0, 10);
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
    scheduledDate: row.type === 'todo' ? localDateKey(row.scheduled_date) : null,
    visibleFrom: localDateKey(row.visible_from),
  };
}

async function loadPlans(userId: number): Promise<PlanRecord[]> {
  const [rows] = await pool.query(`${PLAN_SELECT} WHERE p.user_id = ? GROUP BY p.id ORDER BY p.time, p.sort_order`, [userId]);
  return Array.isArray(rows) ? rows.map((row) => mapPlan(row as PlanRow)) : [];
}

const clock = createReviewClock({ timezone: env.APP_TIME_ZONE });
const repository = createMysqlReviewSnapshotRepository((sql, values) => pool.query(sql, values));

const coordinator = createReviewSnapshotCoordinator({
  repository,
  now: () => clock.now(),
  async generate(user, snapshot) {
    const range = weeklyLookbackRange(snapshot.windowStartDate);
    const [plans, checks, reviews, profile] = await Promise.all([
      loadPlans(user.id),
      listChecks(user, { from: range.from, to: snapshot.windowEndDate }),
      listReviews(user, { from: range.from, to: snapshot.windowEndDate }),
      listUserProfile(user),
    ]);
    const evidence = assembleReviewSnapshotEvidence({
      reviewAsOfDate: snapshot.reviewAsOfDate,
      plans,
      checks,
      reviews,
      profile: profile.traits,
    });
    const config = await resolveAiConfigForUser(user.id);
    if (!config || !aiProviderConfigured(config)) throw new Error('AI 周总结暂时不可用。');
    const result = await chatComplete(config, {
      system: buildWeeklySummarySystemPrompt(),
      user: buildWeeklySummaryUserPrompt(evidence),
      temperature: 0.2,
      maxTokens: 2500,
      jsonResponse: false,
      thinkingMode: 'disabled',
      timeoutMs: Math.max(config.timeoutMs, 60_000),
    });
    const content = parseWeeklySummaryContent(result.text);
    if (!content) throw new Error('AI 周总结暂时不可用。');
    return {
      content,
      model: result.model,
      provider: result.provider,
      evidence,
      evidenceHash: sourceHash(evidence),
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    };
  },
});

function response(snapshot: ReviewSnapshot, fallback = false): WeeklySummaryResponse {
  return {
    status: snapshot.status === 'ready' ? 'ready' : snapshot.status,
    weekStart: snapshot.windowStartDate,
    weekEnd: snapshot.windowEndDate,
    reviewAsOfDate: snapshot.reviewAsOfDate,
    promptVersion: snapshot.promptVersion ?? WEEKLY_SUMMARY_PROMPT_VERSION,
    model: snapshot.model,
    generatedAt: snapshot.generatedAt ?? undefined,
    content: snapshot.content ?? undefined,
    fallback,
    reason: fallback ? '最新回顾更新中，当前显示上一份回顾。' : snapshot.errorMessage ?? undefined,
  };
}

export async function getCurrentWeeklyReviewSnapshot(user: AuthenticatedUser): Promise<WeeklySummaryResponse> {
  const reviewAsOfDate = clock.currentDateKey();
  const current = await coordinator.read(user.id, reviewAsOfDate);
  if (current?.status === 'ready') return response(current);
  const fallback = await repository.latestReady(user.id);
  if (fallback) return response(fallback, true);
  const window = clock.reviewWindow();
  return {
    status: current?.status ?? 'missing',
    weekStart: window.windowStartDate,
    weekEnd: window.windowEndDate,
    reviewAsOfDate,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    reason: current?.errorMessage ?? '最新回顾更新中。',
  };
}

export async function generateCurrentWeeklyReviewSnapshot(user: AuthenticatedUser) {
  return coordinator.generate(user, clock.currentDateKey());
}

export async function catchUpWeeklyReviewSnapshots(): Promise<boolean> {
  const [rows] = await pool.query('SELECT id, username, is_admin FROM users');
  if (!Array.isArray(rows)) return false;
  const snapshots = await Promise.all(rows.map((row) => generateCurrentWeeklyReviewSnapshot({
    id: Number((row as { id: number }).id),
    username: String((row as { username: string }).username),
    isAdmin: Boolean((row as { is_admin: number }).is_admin),
  })));
  return snapshots.some((snapshot) => snapshot?.status === 'error' && (snapshot.attemptCount ?? 0) < 2);
}

interface WeeklyReviewSchedulerDeps {
  catchUp: () => Promise<boolean>;
  millisecondsUntilNextMidnight: () => number;
  retryDelayMilliseconds: number;
  setTimer: (callback: () => void, milliseconds: number) => NodeJS.Timeout;
  clearTimer: (timer: NodeJS.Timeout) => void;
}

export function createWeeklyReviewSnapshotScheduler(deps: WeeklyReviewSchedulerDeps = {
  catchUp: catchUpWeeklyReviewSnapshots,
  millisecondsUntilNextMidnight: () => clock.millisecondsUntilNextMidnight(),
  retryDelayMilliseconds: 60_000,
  setTimer: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
  clearTimer: (timer: NodeJS.Timeout) => clearTimeout(timer),
}): () => void {
  let midnightTimer: NodeJS.Timeout | undefined;
  let retryTimer: NodeJS.Timeout | undefined;
  let catchUpFailureRetries = 0;
  let stopped = false;
  const scheduleRetry = () => {
    if (stopped || retryTimer) return;
    retryTimer = deps.setTimer(() => {
      retryTimer = undefined;
      runCatchUp();
    }, deps.retryDelayMilliseconds);
  };
  const runCatchUp = () => {
    void deps.catchUp().then((shouldRetry) => {
      catchUpFailureRetries = 0;
      if (shouldRetry) scheduleRetry();
    }).catch((error) => {
      console.error('[weekly-review] generation failed', error);
      if (catchUpFailureRetries >= 1) return;
      catchUpFailureRetries += 1;
      scheduleRetry();
    });
  };
  const schedule = () => {
    if (stopped) return;
    midnightTimer = deps.setTimer(() => {
      catchUpFailureRetries = 0;
      runCatchUp();
      schedule();
    }, deps.millisecondsUntilNextMidnight());
  };
  runCatchUp();
  schedule();
  return () => {
    stopped = true;
    if (midnightTimer) deps.clearTimer(midnightTimer);
    if (retryTimer) deps.clearTimer(retryTimer);
  };
}

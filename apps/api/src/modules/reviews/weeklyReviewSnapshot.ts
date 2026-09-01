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
    if (!config || !aiProviderConfigured(config)) throw new Error('本期回顾暂不可用');
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
    if (!content) throw new Error('本期回顾暂不可用');
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

function response(
  snapshot: ReviewSnapshot,
  options: { fallback?: boolean; notice?: WeeklySummaryResponse['notice'] } = {},
): WeeklySummaryResponse {
  return {
    status: snapshot.status === 'ready' ? 'ready' : snapshot.status,
    weekStart: snapshot.windowStartDate,
    weekEnd: snapshot.windowEndDate,
    reviewAsOfDate: snapshot.reviewAsOfDate,
    promptVersion: snapshot.promptVersion ?? WEEKLY_SUMMARY_PROMPT_VERSION,
    model: snapshot.model,
    generatedAt: snapshot.generatedAt ?? undefined,
    content: snapshot.content ?? undefined,
    fallback: options.fallback ?? false,
    notice: options.notice,
  };
}

export async function getCurrentWeeklyReviewSnapshot(user: AuthenticatedUser): Promise<WeeklySummaryResponse> {
  const reviewAsOfDate = clock.currentDateKey();
  const current = await coordinator.read(user.id, reviewAsOfDate);
  if (current?.status === 'ready') return response(current);
  const fallback = await repository.latestReady(user.id);
  if (fallback) {
    return response(fallback, {
      fallback: true,
      notice: current?.status === 'error' ? 'not_updated' : 'updating',
    });
  }
  const window = clock.reviewWindow();
  return {
    status: current?.status ?? 'missing',
    weekStart: window.windowStartDate,
    weekEnd: window.windowEndDate,
    reviewAsOfDate,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    notice: 'unavailable',
    reason: '本期回顾暂不可用',
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

export async function recoverExpiredWeeklyReviewSnapshots(): Promise<void> {
  await repository.expireExhaustedLeases();
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.is_admin
     FROM weekly_review_snapshots s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.status = 'generating'
       AND s.lease_expires_at <= UTC_TIMESTAMP()
       AND s.attempt_count < 2`,
  );
  if (!Array.isArray(rows)) return;
  await Promise.all(rows.map((row) => generateCurrentWeeklyReviewSnapshot({
    id: Number((row as { id: number }).id),
    username: String((row as { username: string }).username),
    isAdmin: Boolean((row as { is_admin: number }).is_admin),
  })));
}

interface WeeklyReviewSchedulerDeps {
  catchUp: () => Promise<boolean>;
  recover?: () => Promise<void>;
  millisecondsUntilNextMidnight: () => number;
  retryDelayMilliseconds: number;
  recoveryIntervalMilliseconds?: number;
  setTimer: (callback: () => void, milliseconds: number) => NodeJS.Timeout;
  clearTimer: (timer: NodeJS.Timeout) => void;
}

export function createWeeklyReviewSnapshotScheduler(deps: WeeklyReviewSchedulerDeps = {
  catchUp: catchUpWeeklyReviewSnapshots,
  recover: recoverExpiredWeeklyReviewSnapshots,
  millisecondsUntilNextMidnight: () => clock.millisecondsUntilNextMidnight(),
  retryDelayMilliseconds: 60_000,
  recoveryIntervalMilliseconds: 60_000,
  setTimer: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
  clearTimer: (timer: NodeJS.Timeout) => clearTimeout(timer),
}): () => void {
  let midnightTimer: NodeJS.Timeout | undefined;
  let retryTimer: NodeJS.Timeout | undefined;
  let recoveryTimer: NodeJS.Timeout | undefined;
  let recoveryInFlight = false;
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
  const runRecovery = () => {
    if (stopped || recoveryInFlight) return;
    recoveryInFlight = true;
    void (deps.recover ?? recoverExpiredWeeklyReviewSnapshots)().catch((error) => {
      console.error('[weekly-review] recovery failed', error);
    }).finally(() => {
      recoveryInFlight = false;
    });
  };
  const scheduleRecovery = () => {
    recoveryTimer = deps.setTimer(() => {
      runRecovery();
      scheduleRecovery();
    }, deps.recoveryIntervalMilliseconds ?? 60_000);
  };
  runCatchUp();
  runRecovery();
  schedule();
  scheduleRecovery();
  return () => {
    stopped = true;
    if (midnightTimer) deps.clearTimer(midnightTimer);
    if (retryTimer) deps.clearTimer(retryTimer);
    if (recoveryTimer) deps.clearTimer(recoveryTimer);
  };
}

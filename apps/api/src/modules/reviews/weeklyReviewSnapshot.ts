import {
  closedWeekReviewAsOf,
  closedWeekStartsThrough,
  createReviewClock,
  DEFAULT_HISTORICAL_START_DATE,
  reviewWindowFor,
  shiftDateKey,
  weeklyReviewPageFor,
  type AuthenticatedUser,
  type PlanRecord,
  type WeeklyReviewDailyEntry,
  type WeeklyReviewPlanItem,
  type WeeklyReviewRuntime,
  type WeeklyReviewSection,
  type WeeklySummaryContent,
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
  composeDeterministicWeeklyContent,
  parseWeeklySummaryContent,
  reviewSourceDataCount,
  sourceHash,
  weeklyLookbackRange,
  weeklySummarySettingKey,
} from './weeklySummaryCore';
import {
  buildWeeklyReviewPage,
  mergeClosedWeeklyHistory,
  recoverClosedWeekSection,
  sectionFromSnapshot,
  type ClosedHistoryWeek,
} from './weeklyReviewPage';
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

async function loadChatgptJournals(userId: number, from: string, to: string): Promise<Record<string, string>> {
  const [rows] = await pool.query(
    `SELECT journal_date, summary_markdown FROM chatgpt_daily_journals
     WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND status IN ('ready', 'final')
       AND journal_date BETWEEN ? AND ? ORDER BY journal_date DESC LIMIT 7`,
    [userId, from, to],
  );
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [
    localDateKey((row as any).journal_date), String((row as any).summary_markdown),
  ]).filter(([date]) => Boolean(date)) as Array<[string, string]>);
}

const clock = createReviewClock({ timezone: env.APP_TIME_ZONE });
const repository = createMysqlReviewSnapshotRepository((sql, values) => pool.query(sql, values));

const coordinator = createReviewSnapshotCoordinator({
  repository,
  now: () => clock.now(),
  async generate(user, snapshot) {
    const range = weeklyLookbackRange(snapshot.windowStartDate);
    const [plans, checks, reviews, profile, chatgptJournals] = await Promise.all([
      loadPlans(user.id),
      listChecks(user, { from: range.from, to: snapshot.windowEndDate }),
      listReviews(user, { from: range.from, to: snapshot.windowEndDate }),
      listUserProfile(user),
      loadChatgptJournals(user.id, snapshot.windowStartDate, snapshot.windowEndDate),
    ]);
    const evidence = assembleReviewSnapshotEvidence({
      reviewAsOfDate: snapshot.reviewAsOfDate,
      plans,
      checks,
      reviews,
      profile: profile.traits,
      chatgptJournals,
    });
    if (reviewSourceDataCount(evidence) === 0) {
      throw new Error('NO_SOURCE_DATA');
    }
    const fallback = () => {
      const content = composeDeterministicWeeklyContent(evidence);
      if (!content) throw new Error('NO_SOURCE_DATA');
      return {
        content,
        model: null,
        provider: 'deterministic',
        evidence,
        evidenceHash: sourceHash(evidence),
        promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      };
    };
    const config = await resolveAiConfigForUser(user.id);
    if (!config || !aiProviderConfigured(config)) return fallback();
    try {
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
      if (!content) return fallback();
      return {
        content,
        model: result.model,
        provider: result.provider,
        evidence,
        evidenceHash: sourceHash(evidence),
        promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      };
    } catch {
      return fallback();
    }
  },
});

async function reviewSourceCount(userId: number, windowStart: string, windowEnd: string): Promise<number> {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM daily_reviews
        WHERE user_id = ? AND review_date BETWEEN ? AND ? AND TRIM(content) <> '')
       +
       (SELECT COUNT(*) FROM checks c INNER JOIN plans p ON p.id = c.plan_id
       WHERE p.user_id = ? AND c.check_date BETWEEN ? AND ? AND c.done = 1)
       +
       (SELECT COUNT(*) FROM chatgpt_daily_journals
        WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND status IN ('ready', 'final')
          AND journal_date BETWEEN ? AND ?)
       AS source_count`,
    [userId, windowStart, windowEnd, userId, windowStart, windowEnd, userId, windowStart, windowEnd],
  );
  if (!Array.isArray(rows) || !rows[0]) return 0;
  return Number((rows[0] as { source_count?: number }).source_count ?? 0);
}

async function currentReviewAvailability(user: AuthenticatedUser, windowStart: string, windowEnd: string) {
  const sourceCount = await reviewSourceCount(user.id, windowStart, windowEnd);
  if (sourceCount === 0) return 'no_data' as const;
  const config = await resolveAiConfigForUser(user.id);
  return config && aiProviderConfigured(config) ? 'available' as const : 'no_provider' as const;
}

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
  const availability = await currentReviewAvailability(user, window.windowStartDate, window.windowEndDate);
  if (availability === 'no_data') {
    return {
      status: 'no_data',
      weekStart: window.windowStartDate,
      weekEnd: window.windowEndDate,
      reviewAsOfDate,
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      notice: 'no_data',
    };
  }
  if (availability === 'no_provider') {
    return {
      status: 'no_provider',
      weekStart: window.windowStartDate,
      weekEnd: window.windowEndDate,
      reviewAsOfDate,
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      notice: 'no_provider',
    };
  }
  if (!current || current.status === 'pending' || current.status === 'generating') {
    return {
      status: current?.status ?? 'missing',
      weekStart: window.windowStartDate,
      weekEnd: window.windowEndDate,
      reviewAsOfDate,
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      notice: 'preparing',
    };
  }
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

async function generateWindowIfPossible(user: AuthenticatedUser, reviewAsOfDate: string, force = false) {
  const window = reviewWindowFor(reviewAsOfDate);
  const availability = await currentReviewAvailability(user, window.windowStartDate, window.windowEndDate);
  if (availability === 'no_data') return null;
  return coordinator.generate(user, reviewAsOfDate, { force });
}

export async function generateCurrentWeeklyReviewSnapshot(user: AuthenticatedUser) {
  const asOf = clock.currentDateKey();
  const page = weeklyReviewPageFor(asOf);
  const closed = await generateWindowIfPossible(user, page.currentWeekStart);
  if (page.isMonday) {
    return closed ? response(closed) : {
      status: 'no_data' as const,
      weekStart: page.previousClosedStart,
      weekEnd: page.previousClosedEnd,
      reviewAsOfDate: asOf,
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
      notice: 'no_data' as const,
    };
  }
  const current = await generateWindowIfPossible(user, asOf);
  return current ? response(current) : {
    status: 'no_data' as const,
    weekStart: page.currentCompletedStart ?? page.currentWeekStart,
    weekEnd: page.currentCompletedEnd ?? page.currentWeekEnd,
    reviewAsOfDate: asOf,
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    notice: 'no_data' as const,
  };
}

export async function dirtyClosedWeekForJournalDate(userId: number, journalDate: string): Promise<void> {
  const asOf = clock.currentDateKey();
  const journalWeek = weeklyReviewPageFor(journalDate);
  const closeMonday = closedWeekReviewAsOf(journalWeek.currentWeekEnd);
  if (asOf >= closeMonday) {
    await repository.markDirty(userId, closeMonday);
    return;
  }
  const current = weeklyReviewPageFor(asOf);
  if (current.completedDays.includes(journalDate)) {
    await repository.markDirty(userId, asOf);
  }
}

function publicHost(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).host || null;
  } catch {
    return null;
  }
}

async function loadRuntime(userId: number): Promise<WeeklyReviewRuntime> {
  const config = await resolveAiConfigForUser(userId);
  return {
    weeklyProvider: config?.provider ?? null,
    weeklyModel: config?.model ?? null,
    weeklySource: config?.source ?? 'none',
    weeklyHost: publicHost(config?.baseUrl),
    activityMethod: 'deterministic_local',
  };
}

async function loadJournals(userId: number, from: string, to: string): Promise<WeeklyReviewDailyEntry[]> {
  if (!from || !to || from > to) return [];
  const [rows] = await pool.query(
    `SELECT journal_date, summary_markdown, activity_count, conversation_count
     FROM chatgpt_daily_journals
     WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND status IN ('ready', 'final')
       AND journal_date BETWEEN ? AND ?
     ORDER BY journal_date ASC`,
    [userId, from, to],
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    date: localDateKey((row as { journal_date: string }).journal_date) ?? '',
    summaryMarkdown: String((row as { summary_markdown: string }).summary_markdown),
    activityCount: Number((row as { activity_count: number }).activity_count),
    conversationCount: Number((row as { conversation_count: number }).conversation_count),
  })).filter((row) => row.date);
}

async function loadCurrentPlans(user: AuthenticatedUser, weekStart: string, weekEnd: string): Promise<WeeklyReviewPlanItem[]> {
  const [plans, checks] = await Promise.all([
    loadPlans(user.id),
    listChecks(user, { from: weekStart, to: weekEnd }),
  ]);
  return plans
    .filter((plan) => plan.type === 'todo' && plan.scheduledDate && plan.scheduledDate >= weekStart && plan.scheduledDate <= weekEnd)
    .filter((plan) => !checks[String(plan.id)]?.[plan.scheduledDate ?? '']?.done)
    .slice(0, 8)
    .map((plan) => ({ kind: 'task' as const, text: plan.name }));
}

async function hasAnyReviewHistory(userId: number): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM weekly_review_snapshots WHERE user_id = ? AND status = 'ready')
       + (SELECT COUNT(*) FROM chatgpt_daily_journals WHERE user_id = ? AND status IN ('ready', 'final'))
       + (SELECT COUNT(*) FROM daily_reviews WHERE user_id = ? AND TRIM(content) <> '')
       + (SELECT COUNT(*) FROM checks c INNER JOIN plans p ON p.id = c.plan_id WHERE p.user_id = ? AND c.done = 1)
       AS history_count`,
    [userId, userId, userId, userId],
  );
  if (!Array.isArray(rows) || !rows[0]) return false;
  return Number((rows[0] as { history_count?: number }).history_count ?? 0) > 0;
}

function snapshotSection(snapshot: ReviewSnapshot | null): WeeklyReviewSection | null {
  if (!snapshot) return null;
  return sectionFromSnapshot({
    weekStart: snapshot.windowStartDate,
    weekEnd: snapshot.windowEndDate,
    status: snapshot.status === 'ready' ? 'ready' : snapshot.status,
    content: snapshot.content,
    model: snapshot.model,
    provider: snapshot.provider,
    generatedAt: snapshot.generatedAt,
  });
}

async function loadWeeklyCacheSection(userId: number, weekStart: string, weekEnd: string): Promise<WeeklyReviewSection | null> {
  const [rows] = await pool.query(
    'SELECT value FROM user_settings WHERE user_id = ? AND key_name = ?',
    [userId, weeklySummarySettingKey(weekStart)],
  );
  if (!Array.isArray(rows) || !rows[0]) return null;
  try {
    const parsed = JSON.parse(String((rows[0] as { value: string }).value)) as {
      content?: WeeklySummaryContent;
      model?: string | null;
      generatedAt?: string;
    };
    if (!parsed?.content) return null;
    return sectionFromSnapshot({
      weekStart,
      weekEnd,
      status: 'ready',
      content: parsed.content,
      model: parsed.model,
      generatedAt: parsed.generatedAt,
    });
  } catch {
    return null;
  }
}

async function composeWeekSection(user: AuthenticatedUser, weekStart: string, weekEnd: string): Promise<WeeklyReviewSection | null> {
  const reviewAsOfDate = closedWeekReviewAsOf(weekEnd);
  const range = weeklyLookbackRange(weekStart);
  const [plans, checks, reviews, profile, chatgptJournals] = await Promise.all([
    loadPlans(user.id),
    listChecks(user, { from: range.from, to: weekEnd }),
    listReviews(user, { from: range.from, to: weekEnd }),
    listUserProfile(user),
    loadChatgptJournals(user.id, weekStart, weekEnd),
  ]);
  const evidence = assembleReviewSnapshotEvidence({
    reviewAsOfDate,
    plans,
    checks,
    reviews,
    profile: profile.traits,
    chatgptJournals,
  });
  const content = composeDeterministicWeeklyContent(evidence);
  if (!content) return null;
  return sectionFromSnapshot({
    weekStart,
    weekEnd,
    status: 'ready',
    content,
    provider: 'deterministic',
  });
}

async function resolveClosedWeekSection(
  user: AuthenticatedUser,
  weekStart: string,
  weekEnd: string,
  snapshot: ReviewSnapshot | null,
): Promise<WeeklyReviewSection | null> {
  const fromSnapshot = snapshotSection(snapshot && snapshot.windowStartDate === weekStart ? snapshot : null);
  if (fromSnapshot?.content || fromSnapshot?.narrativeMarkdown) return fromSnapshot;
  const cached = await loadWeeklyCacheSection(user.id, weekStart, weekEnd);
  if (cached) return recoverClosedWeekSection({ weekStart, weekEnd, snapshot: fromSnapshot, cached });
  const composed = await composeWeekSection(user, weekStart, weekEnd);
  return recoverClosedWeekSection({ weekStart, weekEnd, snapshot: fromSnapshot, cached, composed });
}

export async function attachWeeklyReviewPage(
  user: AuthenticatedUser,
  base: WeeklySummaryResponse,
): Promise<WeeklySummaryResponse> {
  const asOf = base.reviewAsOfDate || clock.currentDateKey();
  const pageWindow = weeklyReviewPageFor(asOf);
  const [previousClosed, currentSnapshot, journals, plans, history, runtime] = await Promise.all([
    repository.findByWindow(user.id, pageWindow.previousClosedStart, pageWindow.previousClosedEnd)
      .then((row) => row ?? repository.find(user.id, pageWindow.currentWeekStart)),
    pageWindow.isMonday ? Promise.resolve(null) : coordinator.read(user.id, asOf),
    loadJournals(
      user.id,
      pageWindow.currentCompletedStart ?? pageWindow.currentWeekStart,
      pageWindow.currentCompletedEnd ?? pageWindow.currentWeekStart,
    ).then((rows) => (pageWindow.isMonday ? [] : rows)),
    loadCurrentPlans(user, pageWindow.currentWeekStart, pageWindow.currentWeekEnd),
    hasAnyReviewHistory(user.id),
    loadRuntime(user.id),
  ]);

  const previousSection = await resolveClosedWeekSection(
    user,
    pageWindow.previousClosedStart,
    pageWindow.previousClosedEnd,
    previousClosed && previousClosed.windowStartDate === pageWindow.previousClosedStart ? previousClosed : null,
  );

  let currentSection = snapshotSection(currentSnapshot);
  if (!pageWindow.isMonday && !(currentSection?.content || currentSection?.narrativeMarkdown)) {
    const composedCurrent = await composeWeekSection(
      user,
      pageWindow.currentWeekStart,
      pageWindow.currentCompletedEnd ?? pageWindow.currentWeekEnd,
    );
    currentSection = recoverClosedWeekSection({
      weekStart: pageWindow.currentCompletedStart ?? pageWindow.currentWeekStart,
      weekEnd: pageWindow.currentCompletedEnd ?? pageWindow.currentWeekEnd,
      snapshot: currentSection,
      composed: composedCurrent,
    }) ?? currentSection;
  }

  const page = buildWeeklyReviewPage({
    asOfDate: asOf,
    previousClosed: previousSection,
    current: currentSection,
    currentDailyJournals: journals,
    currentPlans: plans,
    hasHistory: history || Boolean(previousSection?.content) || journals.length > 0 || plans.length > 0,
    hasPriorHistory: history || Boolean(previousSection),
    runtime,
  });

  return { ...base, page };
}

function historyWeekFromSection(section: WeeklyReviewSection): ClosedHistoryWeek {
  return {
    weekStart: section.weekStart,
    weekEnd: section.weekEnd,
    reviewAsOfDate: closedWeekReviewAsOf(section.weekEnd),
    status: section.status,
    content: section.content,
    narrativeMarkdown: section.narrativeMarkdown,
    model: section.model,
    provider: section.provider,
    generatedAt: section.generatedAt,
  };
}

function groupDatesByClosedWeek(dates: string[]) {
  const groups = new Map<string, { weekStart: string; weekEnd: string; dates: string[] }>();
  for (const date of dates) {
    const page = weeklyReviewPageFor(date);
    const existing = groups.get(page.currentWeekStart);
    if (existing) {
      existing.dates.push(date);
      continue;
    }
    groups.set(page.currentWeekStart, {
      weekStart: page.currentWeekStart,
      weekEnd: page.currentWeekEnd,
      dates: [date],
    });
  }
  return [...groups.values()];
}

export async function listClosedWeeklyHistory(user: AuthenticatedUser, limit = 24) {
  const asOf = clock.currentDateKey();
  const snapshots = await repository.listClosedWeeks(user.id, limit);
  const [journalRows, diaryRows, cacheRows] = await Promise.all([
    pool.query(
      `SELECT journal_date, summary_markdown, activity_count, conversation_count, status, generated_at, updated_at
       FROM chatgpt_daily_journals
       WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND status IN ('ready', 'final')
         AND journal_date >= ?
       ORDER BY journal_date DESC
       LIMIT 400`,
      [user.id, DEFAULT_HISTORICAL_START_DATE],
    ),
    pool.query(
      `SELECT review_date FROM daily_reviews
       WHERE user_id = ? AND TRIM(content) <> '' AND review_date >= ?
       ORDER BY review_date DESC LIMIT 400`,
      [user.id, DEFAULT_HISTORICAL_START_DATE],
    ),
    pool.query(
      `SELECT key_name, value FROM user_settings
       WHERE user_id = ? AND key_name LIKE 'weekly_ai_summary:%'`,
      [user.id],
    ),
  ]);

  const daily = (Array.isArray(journalRows[0]) ? journalRows[0] : []).map((row) => ({
    date: localDateKey((row as { journal_date: string }).journal_date) ?? '',
    summaryMarkdown: String((row as { summary_markdown: string }).summary_markdown),
    activityCount: Number((row as { activity_count: number }).activity_count),
    conversationCount: Number((row as { conversation_count: number }).conversation_count),
    status: String((row as { status: string }).status),
    generatedAt: (row as { generated_at?: string }).generated_at ? new Date(String((row as { generated_at: string }).generated_at)).toISOString() : null,
    updatedAt: new Date(String((row as { updated_at: string }).updated_at)).toISOString(),
  })).filter((row) => row.date);

  const snapshotWeeks = snapshots
    .map((snapshot) => snapshotSection(snapshot))
    .filter((section): section is WeeklyReviewSection => Boolean(section))
    .map(historyWeekFromSection);
  const cachedWeeks: ClosedHistoryWeek[] = [];
  for (const row of Array.isArray(cacheRows[0]) ? cacheRows[0] : []) {
    const key = String((row as { key_name: string }).key_name);
    const weekStart = key.replace(/^weekly_ai_summary:/, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) continue;
    try {
      const parsed = JSON.parse(String((row as { value: string }).value)) as {
        content?: WeeklySummaryContent;
        model?: string | null;
        generatedAt?: string;
      };
      if (!parsed?.content) continue;
      cachedWeeks.push(historyWeekFromSection(sectionFromSnapshot({
        weekStart,
        weekEnd: shiftDateKey(weekStart, 6),
        status: 'ready',
        content: parsed.content,
        model: parsed.model,
        generatedAt: parsed.generatedAt,
      })));
    } catch {
      continue;
    }
  }

  const fromJournals: ClosedHistoryWeek[] = [];
  for (const group of groupDatesByClosedWeek(daily.map((item) => item.date))) {
    const weekDays = daily.filter((item) => group.dates.includes(item.date));
    const narrative = weekDays.map((item) => item.summaryMarkdown).join('\n\n').slice(0, 4000);
    fromJournals.push({
      weekStart: group.weekStart,
      weekEnd: group.weekEnd,
      reviewAsOfDate: closedWeekReviewAsOf(group.weekEnd),
      status: 'ready',
      content: {
        overall: '由每日小记整理',
        summary: narrative.slice(0, 1800),
        comparison: '无法判断',
        positive: '无法判断',
        concerns: '无法判断',
        nextFocus: ['查看每日小记'],
        narrativeMarkdown: narrative,
      },
      narrativeMarkdown: narrative,
      model: null,
      provider: 'deterministic',
      generatedAt: null,
    });
  }

  const diaryDates = (Array.isArray(diaryRows[0]) ? diaryRows[0] : [])
    .map((row) => localDateKey((row as { review_date: string }).review_date))
    .filter((date): date is string => Boolean(date));
  const fromDiaries: ClosedHistoryWeek[] = [];
  for (const group of groupDatesByClosedWeek(diaryDates)) {
    const composed = await composeWeekSection(user, group.weekStart, group.weekEnd);
    if (composed) fromDiaries.push(historyWeekFromSection(composed));
  }

  const weekly = mergeClosedWeeklyHistory({
    asOf,
    historicalStart: DEFAULT_HISTORICAL_START_DATE,
    limit,
    snapshots: snapshotWeeks,
    cached: cachedWeeks,
    fromJournals,
    fromDiaries,
  });

  return { daily, weekly };
}

const MAX_CLOSED_BACKFILL = 6;

async function backfillClosedWeeklyReviews(user: AuthenticatedUser): Promise<ReviewSnapshot | null> {
  const asOf = clock.currentDateKey();
  const page = weeklyReviewPageFor(asOf);
  const starts = closedWeekStartsThrough(DEFAULT_HISTORICAL_START_DATE, page.previousClosedStart)
    .reverse()
    .slice(0, MAX_CLOSED_BACKFILL);
  let last: ReviewSnapshot | null = null;
  for (const weekStart of starts) {
    const weekEnd = shiftDateKey(weekStart, 6);
    const closeAsOf = closedWeekReviewAsOf(weekEnd);
    const existing = await repository.find(user.id, closeAsOf);
    if (existing?.status === 'ready' && existing.content) continue;
    const availability = await currentReviewAvailability(user, weekStart, weekEnd);
    if (availability === 'no_data') continue;
    if (existing?.status === 'error') await repository.markDirty(user.id, closeAsOf);
    last = await generateWindowIfPossible(user, closeAsOf) ?? last;
  }
  return last;
}

export async function catchUpWeeklyReviewSnapshots(): Promise<boolean> {
  const [rows] = await pool.query('SELECT id, username, is_admin FROM users');
  if (!Array.isArray(rows)) return false;
  let shouldRetry = false;
  for (const row of rows) {
    const user = {
      id: Number((row as { id: number }).id),
      username: String((row as { username: string }).username),
      isAdmin: Boolean((row as { is_admin: number }).is_admin),
    };
    try {
      const current = await generateCurrentWeeklyReviewSnapshot(user);
      if (current?.status === 'error') shouldRetry = true;
      const closed = await backfillClosedWeeklyReviews(user);
      if (closed?.status === 'error' && (closed.attemptCount ?? 0) < 2) shouldRetry = true;
    } catch (error) {
      console.error('[weekly-review] catch-up skipped a user', error instanceof Error ? error.message : 'unknown');
      shouldRetry = true;
    }
  }
  return shouldRetry;
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

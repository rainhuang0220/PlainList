import type {
  AiReviewDaySummary,
  AiReviewPeriod,
  AiReviewPlanSummary,
  AiReviewResponse,
  AiReviewSummary,
  AuthenticatedUser,
  PlanType,
} from '@plainlist/shared';
import { aiReviewRequestSchema, getMonthRange, getWeekStart, toDateKey } from '@plainlist/shared';
import { env } from '../../config/env';
import { pool } from '../../db/pool';

type PlanRow = {
  id: number;
  type: PlanType;
  name: string;
  time: string;
  sort_order: number;
};

type CheckRow = {
  plan_id: number;
  check_date: Date | string;
  done: number;
};

type LoadedPlan = {
  id: number;
  name: string;
  type: PlanType;
  sortOrder: number;
};

type DayProgress = AiReviewDaySummary & {
  perfect: boolean;
  missedChecks: number;
};

const PERIOD_TITLES: Record<AiReviewPeriod, string> = {
  day: '每日',
  week: '每周',
  month: '每月',
  year: '每年',
};

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDateKey(value: Date | string): string {
  if (value instanceof Date) {
    return toDateKey(value);
  }

  const normalized = String(value).trim();
  const dateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }

  return toDateKey(new Date(normalized));
}

function maxDateKey(left: string, right: string): string {
  return left >= right ? left : right;
}

function minDateKey(left: string, right: string): string {
  return left <= right ? left : right;
}

function enumerateDateKeys(from: string, to: string): string[] {
  if (from > to) {
    return [];
  }

  const result: string[] = [];
  const cursor = parseDateKey(from);
  const end = parseDateKey(to);

  while (cursor <= end) {
    result.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function roundPercent(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function buildPeriodWindow(period: AiReviewPeriod, referenceDate: string) {
  const reference = parseDateKey(referenceDate);
  const todayKey = toDateKey(new Date());
  let from = referenceDate;
  let periodEnd = referenceDate;

  switch (period) {
    case 'day':
      from = referenceDate;
      periodEnd = referenceDate;
      break;
    case 'week': {
      const start = getWeekStart(reference);
      from = toDateKey(start);
      periodEnd = toDateKey(addDays(start, 6));
      break;
    }
    case 'month': {
      const range = getMonthRange(reference.getFullYear(), reference.getMonth());
      from = range.from;
      periodEnd = range.to;
      break;
    }
    case 'year':
      from = `${reference.getFullYear()}-01-01`;
      periodEnd = `${reference.getFullYear()}-12-31`;
      break;
  }

  const to = minDateKey(minDateKey(periodEnd, referenceDate), todayKey);
  return {
    from,
    to,
    periodLabel: `${PERIOD_TITLES[period]}锐评 ${from}${from === to ? '' : ` ~ ${to}`}`,
  };
}

function formatPlanStats(plan: AiReviewPlanSummary): string {
  return `${plan.name}(${plan.completedDays}/${plan.expectedDays}, ${plan.completionRate}%)`;
}

function formatDayStats(day: AiReviewDaySummary): string {
  return `${day.date} ${day.completedChecks}/${day.expectedChecks}(${day.completionRate}%)`;
}

function buildReviewPrompt(summary: AiReviewSummary): string {
  const bestPlans = summary.bestPlans.length > 0
    ? summary.bestPlans.map(formatPlanStats).join('；')
    : '暂无';
  const weakestPlans = summary.weakestPlans.length > 0
    ? summary.weakestPlans.map(formatPlanStats).join('；')
    : '暂无';
  const missedDays = summary.mostMissedDays.length > 0
    ? summary.mostMissedDays.map(formatDayStats).join('；')
    : '暂无明显崩盘日';

  return [
    `周期：${summary.periodLabel}`,
    `统计口径：当前应用中的 habit 和 todo 都按“每天是否完成一次”统计。`,
    `参考日期：${summary.referenceDate}`,
    `评估范围：${summary.from} ~ ${summary.to}`,
    `计划总数：${summary.totalPlans}（habit ${summary.habitCount}，todo ${summary.todoCount}）`,
    `评估天数：${summary.activeDays}`,
    `整体完成：${summary.completedChecks}/${summary.expectedChecks}`,
    `整体完成率：${summary.completionRate}%`,
    `完美天数：${summary.perfectDays}/${summary.activeDays}（${summary.perfectDayRate}%）`,
    `当前连续完美天数：${summary.currentPerfectStreak}`,
    `最长连续完美天数：${summary.longestPerfectStreak}`,
    `表现最好：${bestPlans}`,
    `最拖后腿：${weakestPlans}`,
    `丢分最重日期：${missedDays}`,
  ].join('\n');
}

function buildFallbackReview(summary: AiReviewSummary): string {
  const best = summary.bestPlans[0];
  const weakest = summary.weakestPlans[0];
  const worstDay = summary.mostMissedDays[0];
  const completionText = `${summary.completedChecks}/${summary.expectedChecks}，完成率 ${summary.completionRate}%`;
  const bestText = best ? `${best.name} 还有 ${best.completionRate}%` : '暂时没有能拿来吹的项目';
  const weakText = weakest ? `${weakest.name} 只做到了 ${weakest.completionRate}%` : '当前还看不出最弱项';
  const worstDayText = worstDay
    ? `${worstDay.date} 只完成了 ${worstDay.completedChecks}/${worstDay.expectedChecks}`
    : '最近没有单日雪崩';

  return `这${PERIOD_TITLES[summary.period]}的执行表现不算体面：${completionText}。${weakText}，说明问题不是不会做，而是总在该出手时掉线。好消息是 ${bestText}，证明你并非完全没执行力。先把 ${weakest ? `“${weakest.name}”` : '最弱项'} 固定到同一时间段，再盯住 ${worstDayText} 这种崩盘节点，不然计划写得再满也只是给拖延症做装修。`;
}

async function requestModelReview(summary: AiReviewSummary): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_REVIEW_TIMEOUT_MS);
  const baseUrl = env.AI_REVIEW_BASE_URL.replace(/\/+$/, '');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_REVIEW_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_REVIEW_MODEL,
        temperature: 0.9,
        max_tokens: 420,
        stream: false,
        messages: [
          {
            role: 'system',
            content: '你是一个说话尖锐但负责的中文执行教练。请基于给定数据写一段锐评：可以辛辣、直接、带讽刺，但不能羞辱人格，必须引用具体数字和计划名，不得编造数据。先指出最痛的问题，再给 1 到 2 条可执行建议。输出 140 到 220 个中文字符，不要标题，不要列表，不要 Markdown。',
          },
          {
            role: 'user',
            content: buildReviewPrompt(summary),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw serviceError(502, `ai review upstream failed: ${errorText || response.statusText}`);
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const joined = content
        .map((item) => typeof item.text === 'string' ? item.text : '')
        .join('')
        .trim();
      if (joined) {
        return joined;
      }
    }

    throw serviceError(502, 'ai review upstream returned empty content');
  } finally {
    clearTimeout(timeout);
  }
}

async function loadPlans(user: AuthenticatedUser): Promise<LoadedPlan[]> {
  const [rows] = await pool.query(
    'SELECT id, type, name, sort_order FROM plans WHERE user_id = ? ORDER BY time, sort_order',
    [user.id],
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => {
    const plan = row as PlanRow;
    return {
      id: plan.id,
      name: plan.name,
      type: plan.type,
      sortOrder: plan.sort_order,
    };
  });
}

async function loadChecks(user: AuthenticatedUser, from: string, to: string) {
  const [rows] = await pool.query(
    `SELECT c.plan_id, c.check_date, c.done
     FROM checks c
     INNER JOIN plans p ON p.id = c.plan_id
     WHERE p.user_id = ? AND c.check_date BETWEEN ? AND ?
     ORDER BY c.check_date`,
    [user.id, from, to],
  );

  if (!Array.isArray(rows)) {
    return new Map<string, boolean>();
  }

  return rows.reduce((result, row) => {
    const record = row as CheckRow;
    result.set(`${record.plan_id}:${formatDateKey(record.check_date)}`, Boolean(record.done));
    return result;
  }, new Map<string, boolean>());
}

export async function buildAiReviewSummary(user: AuthenticatedUser, payload: unknown): Promise<AiReviewSummary> {
  const input = aiReviewRequestSchema.parse(payload);
  const referenceDate = input.referenceDate ?? toDateKey(new Date());
  const window = buildPeriodWindow(input.period, referenceDate);

  if (window.from > window.to) {
    throw serviceError(400, 'selected period is in the future');
  }

  const [plans, checksMap] = await Promise.all([
    loadPlans(user),
    loadChecks(user, window.from, window.to),
  ]);

  const activePlans = plans;
  if (activePlans.length === 0) {
    throw serviceError(400, 'no plans available for the selected period');
  }

  const dateKeys = enumerateDateKeys(window.from, window.to);
  if (dateKeys.length === 0) {
    throw serviceError(400, 'no days available for the selected period');
  }

  const daySummaries: DayProgress[] = dateKeys.map((dateKey) => {
    const completedChecks = activePlans.reduce((count, plan) => (
      checksMap.get(`${plan.id}:${dateKey}`) ? count + 1 : count
    ), 0);
    const expectedChecks = activePlans.length;
    const missedChecks = Math.max(expectedChecks - completedChecks, 0);
    const perfect = expectedChecks > 0 && completedChecks === expectedChecks;

    return {
      date: dateKey,
      completedChecks,
      expectedChecks,
      completionRate: expectedChecks === 0 ? 0 : roundPercent(completedChecks / expectedChecks),
      perfect,
      missedChecks,
    };
  }).filter((summary) => summary.expectedChecks > 0);

  if (daySummaries.length === 0) {
    throw serviceError(400, 'no active plans available for the selected period');
  }

  const planSummaries: AiReviewPlanSummary[] = activePlans
    .map((plan) => {
      const completedDays = dateKeys.reduce((count, dateKey) => (
        checksMap.get(`${plan.id}:${dateKey}`) ? count + 1 : count
      ), 0);

      return {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        completedDays,
        expectedDays: dateKeys.length,
        completionRate: dateKeys.length === 0 ? 0 : roundPercent(completedDays / dateKeys.length),
      };
    })
    .filter((summary) => summary.expectedDays > 0);

  if (planSummaries.length === 0) {
    throw serviceError(400, 'no plan progress found for the selected period');
  }

  const totalExpectedChecks = daySummaries.reduce((sum, item) => sum + item.expectedChecks, 0);
  const totalCompletedChecks = daySummaries.reduce((sum, item) => sum + item.completedChecks, 0);
  const perfectDays = daySummaries.filter((item) => item.perfect).length;

  let currentPerfectStreak = 0;
  for (let index = daySummaries.length - 1; index >= 0; index -= 1) {
    if (!daySummaries[index].perfect) {
      break;
    }

    currentPerfectStreak += 1;
  }

  let longestPerfectStreak = 0;
  let streak = 0;
  for (const day of daySummaries) {
    if (day.perfect) {
      streak += 1;
      longestPerfectStreak = Math.max(longestPerfectStreak, streak);
    } else {
      streak = 0;
    }
  }

  const planSorter = (left: AiReviewPlanSummary, right: AiReviewPlanSummary) => (
    right.completionRate - left.completionRate
    || right.completedDays - left.completedDays
    || right.expectedDays - left.expectedDays
    || left.name.localeCompare(right.name, 'zh-Hans-CN')
  );

  const weakestPlanSorter = (left: AiReviewPlanSummary, right: AiReviewPlanSummary) => (
    left.completionRate - right.completionRate
    || left.completedDays - right.completedDays
    || right.expectedDays - left.expectedDays
    || left.name.localeCompare(right.name, 'zh-Hans-CN')
  );

  const highestCompletionRate = Math.max(...planSummaries.map((plan) => plan.completionRate));
  const lowestCompletionRate = Math.min(...planSummaries.map((plan) => plan.completionRate));
  const hasMeaningfulPlanSpread = highestCompletionRate !== lowestCompletionRate;
  const bestPlans = hasMeaningfulPlanSpread
    ? [...planSummaries].sort(planSorter).slice(0, 3)
    : [];
  const weakestPlans = hasMeaningfulPlanSpread
    ? [...planSummaries].sort(weakestPlanSorter).slice(0, 3)
    : [];
  const mostMissedDays = [...daySummaries]
    .filter((day) => day.missedChecks > 0)
    .sort((left, right) => (
      right.missedChecks - left.missedChecks
      || left.completionRate - right.completionRate
      || right.date.localeCompare(left.date)
    ))
    .slice(0, 5)
    .map(({ date, completedChecks, expectedChecks, completionRate }) => ({
      date,
      completedChecks,
      expectedChecks,
      completionRate,
    }));

  return {
    period: input.period,
    periodLabel: window.periodLabel,
    referenceDate,
    from: window.from,
    to: window.to,
    totalPlans: planSummaries.length,
    habitCount: planSummaries.filter((plan) => plan.type === 'habit').length,
    todoCount: planSummaries.filter((plan) => plan.type === 'todo').length,
    activeDays: daySummaries.length,
    expectedChecks: totalExpectedChecks,
    completedChecks: totalCompletedChecks,
    completionRate: totalExpectedChecks === 0 ? 0 : roundPercent(totalCompletedChecks / totalExpectedChecks),
    perfectDays,
    perfectDayRate: daySummaries.length === 0 ? 0 : roundPercent(perfectDays / daySummaries.length),
    currentPerfectStreak,
    longestPerfectStreak,
    bestPlans,
    weakestPlans,
    mostMissedDays,
  };
}

export async function generateAiReview(user: AuthenticatedUser, payload: unknown): Promise<AiReviewResponse> {
  const summary = await buildAiReviewSummary(user, payload);
  const generatedAt = new Date().toISOString();

  if (!env.AI_REVIEW_API_KEY.trim()) {
    return {
      period: summary.period,
      review: buildFallbackReview(summary),
      model: 'built-in-fallback',
      source: 'fallback',
      generatedAt,
      summary,
    };
  }

  try {
    return {
      period: summary.period,
      review: await requestModelReview(summary),
      model: env.AI_REVIEW_MODEL,
      source: 'ai',
      generatedAt,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ai-reviews] falling back to local critique:', message);

    return {
      period: summary.period,
      review: buildFallbackReview(summary),
      model: 'built-in-fallback',
      source: 'fallback',
      generatedAt,
      summary,
    };
  }
}

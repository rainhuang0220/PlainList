import { normalizeWeekStart, shiftDateKey, type AuthenticatedUser } from '@plainlist/shared';
import { pool } from '../../db/pool';

export const WEEK_CONTEXT_MAX_BYTES = 24 * 1024;

type JsonObject = Record<string, unknown>;
type WeeklyRow = { status: string; content: string | JsonObject | null; generated_at: Date | string | null };
type DailyRow = { date_key: string; content: string | JsonObject };
type GoalRow = {
  id: number; title: string; description: string | null; priority_rank: number;
  time_horizon: string; domain: string | null; success_signals: string[] | string;
};

function parseObject(value: string | JsonObject | null): JsonObject | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as JsonObject : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = stringValue(item, maxLength);
    return text ? [text] : [];
  }).slice(0, maxItems);
}

function parseList(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function compactWeekly(content: JsonObject | null) {
  if (!content) return null;
  return {
    progress: stringValue(content.progress, 40) ?? 'unknown',
    goalAlignment: stringValue(content.alignment, 40) ?? 'unknown',
    output: stringValue(content.output, 40) ?? 'unknown',
    exploration: stringValue(content.exploration, 40) ?? 'unknown',
    opportunityCost: stringValue(content.opportunityCost, 40) ?? 'unknown',
    summary: stringValue(content.summary, 1200) ?? '',
    outputs: stringList(content.outputs, 8, 300),
    openLoops: stringList(content.openLoops, 8, 300),
    nextFocus: stringList(content.suggestedNextFocus, 3, 300),
    evidenceFactIds: Array.isArray(content.evidenceFactIds)
      ? content.evidenceFactIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0).slice(0, 30)
      : [],
    unknowns: stringList(content.unknowns, 6, 200),
  };
}

function compactDaily(row: DailyRow) {
  const content = parseObject(row.content) ?? {};
  return {
    dateKey: row.date_key,
    mainProgress: stringValue(content.mainProgress, 320) ?? '',
    outputs: stringList(content.outputs, 2, 240),
    learnings: stringList(content.learnings, 2, 240),
    openLoops: stringList(content.unresolved, 2, 240),
  };
}

type CompactIntelligence = ReturnType<typeof compactWeekly>;

function enforceBudget<T extends {
  daily: unknown[];
  goals: Array<{ description?: string; successSignals: string[] }>;
  intelligence: CompactIntelligence;
}>(context: T): T {
  while (Buffer.byteLength(JSON.stringify(context), 'utf8') > WEEK_CONTEXT_MAX_BYTES && context.daily.length) {
    context.daily.pop();
  }
  while (Buffer.byteLength(JSON.stringify(context), 'utf8') > WEEK_CONTEXT_MAX_BYTES
    && context.goals.some((goal) => goal.description || goal.successSignals.length)) {
    for (const goal of context.goals) {
      goal.description = undefined;
      goal.successSignals = goal.successSignals.slice(0, 1);
    }
  }
  while (Buffer.byteLength(JSON.stringify(context), 'utf8') > WEEK_CONTEXT_MAX_BYTES && context.goals.length) {
    context.goals.pop();
  }
  const intelligence = context.intelligence;
  if (intelligence) {
    const removable = [intelligence.unknowns, intelligence.openLoops, intelligence.nextFocus, intelligence.outputs];
    for (const list of removable) {
      while (Buffer.byteLength(JSON.stringify(context), 'utf8') > WEEK_CONTEXT_MAX_BYTES && list.length) list.pop();
    }
    while (Buffer.byteLength(JSON.stringify(context), 'utf8') > WEEK_CONTEXT_MAX_BYTES && intelligence.summary.length) {
      intelligence.summary = intelligence.summary.slice(0, Math.floor(intelligence.summary.length / 2));
    }
  }
  return context;
}

export async function getWeekContext(user: AuthenticatedUser, rawWeekStart: string) {
  const weekStart = normalizeWeekStart(rawWeekStart);
  const weekEnd = shiftDateKey(weekStart, 6);
  const [weeklyRows] = await pool.query(
    `SELECT status, content, generated_at FROM weekly_activity_intelligence
     WHERE user_id = ? AND week_start = ? LIMIT 1`, [user.id, weekStart],
  );
  const weekly = Array.isArray(weeklyRows) && weeklyRows.length ? weeklyRows[0] as WeeklyRow : null;
  const [dailyRows] = await pool.query(
    `SELECT date_key, content FROM daily_activity_digests
     WHERE user_id = ? AND date_key BETWEEN ? AND ? AND status = 'ready' AND content IS NOT NULL
     ORDER BY date_key ASC LIMIT 7`, [user.id, weekStart, weekEnd],
  );
  const [goalRows] = await pool.query(
    `SELECT id, title, description, priority_rank, time_horizon, domain, success_signals
     FROM activity_goals WHERE user_id = ? AND status = 'active'
     ORDER BY priority_rank ASC, id ASC LIMIT 12`, [user.id],
  );
  const intelligence = compactWeekly(parseObject(weekly?.content ?? null));
  const daily = intelligence ? [] : (Array.isArray(dailyRows) ? dailyRows as DailyRow[] : []).map(compactDaily);
  const goals = (Array.isArray(goalRows) ? goalRows as GoalRow[] : []).map((goal) => ({
    id: goal.id,
    title: goal.title.slice(0, 160),
    description: goal.description?.slice(0, 320),
    priority: goal.priority_rank,
    domain: goal.domain?.slice(0, 80) ?? null,
    timeHorizon: goal.time_horizon,
    successSignals: parseList(goal.success_signals).map((item) => item.slice(0, 240)).slice(0, 4),
  }));
  return enforceBudget({
    weekStart,
    status: weekly?.status ?? 'missing',
    generatedAt: weekly?.generated_at ? String(weekly.generated_at) : null,
    goals,
    intelligence,
    daily,
  });
}

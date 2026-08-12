import type { AuthenticatedUser, CheckDayState, ChecksByPlan } from '@plainlist/shared';
import { batchChecksSchema, checksQuerySchema, checkUpsertSchema } from '@plainlist/shared';
import { getMonthRange, getPreviousMonth, toDateKey } from '@plainlist/shared';
import { pool } from '../../db/pool';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function getDefaultRange(): { from: string; to: string } {
  const now = new Date();
  const previous = getPreviousMonth(now.getFullYear(), now.getMonth());
  return {
    from: `${previous.year}-${String(previous.month + 1).padStart(2, '0')}-01`,
    to: getMonthRange(now.getFullYear(), now.getMonth()).to,
  };
}

export async function listChecks(user: AuthenticatedUser, query: unknown): Promise<ChecksByPlan> {
  const parsed = checksQuerySchema.parse(query);
  const range = parsed.from && parsed.to ? parsed : getDefaultRange();
  const [rows] = await pool.query(
    `SELECT c.plan_id, c.check_date, c.done, c.actual_minutes
     FROM checks c
     INNER JOIN plans p ON p.id = c.plan_id
     WHERE p.user_id = ? AND c.check_date BETWEEN ? AND ?
     ORDER BY c.check_date`,
    [user.id, range.from, range.to],
  );

  if (!Array.isArray(rows)) {
    return {};
  }

  return rows.reduce<ChecksByPlan>((result, row) => {
    const record = row as {
      plan_id: number;
      check_date: Date | string;
      done: number;
      actual_minutes: number | null;
    };
    const planId = String(record.plan_id);
    const dateKey = record.check_date instanceof Date
      ? toDateKey(record.check_date)
      : String(record.check_date).slice(0, 10);

    if (!result[planId]) {
      result[planId] = {};
    }

    result[planId][dateKey] = {
      done: Boolean(record.done),
      actualMinutes: record.actual_minutes ?? null,
    };
    return result;
  }, {});
}

async function ensurePlanOwnership(user: AuthenticatedUser, planIds: number[]): Promise<void> {
  if (planIds.length === 0) {
    return;
  }

  const [rows] = await pool.query('SELECT id FROM plans WHERE user_id = ? AND id IN (?)', [user.id, planIds]);
  const owned = new Set(Array.isArray(rows) ? rows.map((row) => Number((row as { id: number }).id)) : []);

  if (planIds.some((planId) => !owned.has(planId))) {
    throw serviceError(403, 'some plans not owned by you');
  }
}

async function loadPlanDurations(planIds: number[]): Promise<Map<number, number | null>> {
  const durations = new Map<number, number | null>();
  if (planIds.length === 0) {
    return durations;
  }

  const [rows] = await pool.query(
    'SELECT id, duration_minutes FROM plans WHERE id IN (?)',
    [planIds],
  );

  if (Array.isArray(rows)) {
    for (const row of rows) {
      const record = row as { id: number; duration_minutes: number | null };
      durations.set(Number(record.id), record.duration_minutes ?? null);
    }
  }

  return durations;
}

function checkCellKey(planId: number, date: string): string {
  return `${planId}|${date}`;
}

async function loadExistingActualMinutes(
  cells: Array<{ planId: number; date: string }>,
): Promise<Map<string, number | null>> {
  const existing = new Map<string, number | null>();
  if (cells.length === 0) {
    return existing;
  }

  const placeholders = cells.map(() => '(?, ?)').join(', ');
  const [rows] = await pool.query(
    `SELECT plan_id, check_date, actual_minutes
     FROM checks
     WHERE (plan_id, check_date) IN (${placeholders})`,
    cells.flatMap((cell) => [cell.planId, cell.date]),
  );

  if (Array.isArray(rows)) {
    for (const row of rows) {
      const record = row as {
        plan_id: number;
        check_date: Date | string;
        actual_minutes: number | null;
      };
      const dateKey = record.check_date instanceof Date
        ? toDateKey(record.check_date)
        : String(record.check_date).slice(0, 10);
      existing.set(checkCellKey(Number(record.plan_id), dateKey), record.actual_minutes ?? null);
    }
  }

  return existing;
}

/**
 * Resolve actual_minutes for upsert:
 * 1. done=false → null
 * 2. done=true + number → that number
 * 3. done=true + omitted (undefined) → COALESCE(existing, plan duration, null)
 * 4. done=true + explicit null → COALESCE(plan duration, null) (reset to plan default)
 */
export function resolveActualMinutes(
  done: boolean,
  actualMinutes: number | null | undefined,
  planDurationMinutes: number | null | undefined,
  existingActualMinutes: number | null | undefined,
): number | null {
  if (!done) {
    return null;
  }

  if (actualMinutes != null) {
    return actualMinutes;
  }

  if (actualMinutes === undefined) {
    return existingActualMinutes ?? planDurationMinutes ?? null;
  }

  return planDurationMinutes ?? null;
}

export async function upsertCheck(user: AuthenticatedUser, payload: unknown): Promise<CheckDayState> {
  const input = checkUpsertSchema.parse(payload);
  await ensurePlanOwnership(user, [input.planId]);

  const durations = await loadPlanDurations([input.planId]);
  const existing = await loadExistingActualMinutes([{ planId: input.planId, date: input.date }]);
  const actualMinutes = resolveActualMinutes(
    input.done,
    input.actualMinutes,
    durations.get(input.planId),
    existing.get(checkCellKey(input.planId, input.date)),
  );

  await pool.query(
    `INSERT INTO checks (plan_id, check_date, done, actual_minutes) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE done = VALUES(done), actual_minutes = VALUES(actual_minutes)`,
    [input.planId, input.date, input.done ? 1 : 0, actualMinutes],
  );

  return { done: input.done, actualMinutes };
}

export async function upsertChecksBatch(user: AuthenticatedUser, payload: unknown): Promise<number> {
  const input = batchChecksSchema.parse(payload);
  const planIds = [...new Set(input.checks.map((item) => item.planId))];
  await ensurePlanOwnership(user, planIds);

  const durations = await loadPlanDurations(planIds);
  const existing = await loadExistingActualMinutes(
    input.checks.map((item) => ({ planId: item.planId, date: item.date })),
  );
  const values = input.checks.map((item) => [
    item.planId,
    item.date,
    item.done ? 1 : 0,
    resolveActualMinutes(
      item.done,
      item.actualMinutes,
      durations.get(item.planId),
      existing.get(checkCellKey(item.planId, item.date)),
    ),
  ]);
  if (values.length > 0) {
    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    await pool.query(
      `INSERT INTO checks (plan_id, check_date, done, actual_minutes) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE done = VALUES(done), actual_minutes = VALUES(actual_minutes)`,
      values.flat(),
    );
  }

  return values.length;
}

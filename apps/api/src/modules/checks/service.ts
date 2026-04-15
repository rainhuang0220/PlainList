import type { AuthenticatedUser, ChecksByPlan } from '@plainlist/shared';
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
    `SELECT c.plan_id, c.check_date, c.done
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
    const record = row as { plan_id: number; check_date: Date | string; done: number };
    const planId = String(record.plan_id);
    const dateKey = record.check_date instanceof Date
      ? toDateKey(record.check_date)
      : String(record.check_date).slice(0, 10);

    if (!result[planId]) {
      result[planId] = {};
    }

    result[planId][dateKey] = Boolean(record.done);
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

export async function upsertCheck(user: AuthenticatedUser, payload: unknown): Promise<void> {
  const input = checkUpsertSchema.parse(payload);
  await ensurePlanOwnership(user, [input.planId]);

  await pool.query(
    `INSERT INTO checks (plan_id, check_date, done) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE done = VALUES(done)`,
    [input.planId, input.date, input.done ? 1 : 0],
  );
}

export async function upsertChecksBatch(user: AuthenticatedUser, payload: unknown): Promise<number> {
  const input = batchChecksSchema.parse(payload);
  const planIds = [...new Set(input.checks.map((item) => item.planId))];
  await ensurePlanOwnership(user, planIds);

  const values = input.checks.map((item) => [item.planId, item.date, item.done ? 1 : 0]);
  if (values.length > 0) {
    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    await pool.query(
      `INSERT INTO checks (plan_id, check_date, done) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE done = VALUES(done)`,
      values.flat(),
    );
  }

  return values.length;
}

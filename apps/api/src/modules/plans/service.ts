import type { AuthenticatedUser, PlanRecord } from '@plainlist/shared';
import { createPlanSchema, planIdParamSchema } from '@plainlist/shared';
import { pool } from '../../db/pool';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function mapPlan(row: { id: number; type: 'habit' | 'todo'; name: string; time: string; sort_order: number }): PlanRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    time: row.time,
    sortOrder: row.sort_order,
  };
}

export async function listPlans(user: AuthenticatedUser): Promise<PlanRecord[]> {
  const [rows] = await pool.query(
    'SELECT id, type, name, time, sort_order FROM plans WHERE user_id = ? ORDER BY time, sort_order',
    [user.id],
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => mapPlan(row as { id: number; type: 'habit' | 'todo'; name: string; time: string; sort_order: number }));
}

export async function createPlan(user: AuthenticatedUser, payload: unknown): Promise<PlanRecord> {
  if (user.isAdmin) {
    throw serviceError(403, 'admin account is read-only');
  }

  const input = createPlanSchema.parse(payload);
  const [result] = await pool.query('INSERT INTO plans (user_id, type, name, time) VALUES (?, ?, ?, ?)', [
    user.id,
    input.type,
    input.name,
    input.time,
  ]);

  return {
    id: Number((result as { insertId: number }).insertId),
    type: input.type,
    name: input.name,
    time: input.time,
    sortOrder: 0,
  };
}

export async function deletePlan(user: AuthenticatedUser, planIdInput: unknown): Promise<void> {
  if (user.isAdmin) {
    throw serviceError(403, 'admin account is read-only');
  }

  const { id } = planIdParamSchema.parse(planIdInput);
  const [result] = await pool.query('DELETE FROM plans WHERE id = ? AND user_id = ?', [id, user.id]);

  if (Number((result as { affectedRows: number }).affectedRows) === 0) {
    throw serviceError(404, 'plan not found');
  }
}

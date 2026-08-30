import type { AuthenticatedUser } from '@plainlist/shared';
import {
  activityGoalIdParamSchema,
  createActivityGoalSchema,
  updateActivityGoalSchema,
  type CreateActivityGoalInput,
} from '@plainlist/shared';
import { pool } from '../../db/pool';

type GoalStatus = 'active' | 'paused' | 'achieved' | 'archived';
interface GoalRow {
  id: number; title: string; description: string | null; priority_rank: number;
  time_horizon: 'near_term' | 'medium_term' | 'long_term'; status: GoalStatus; domain: string | null;
  success_signals: string[] | string; anti_goals: string[] | string; version: number;
  created_at: string | Date; updated_at: string | Date;
}

export interface ActivityGoalRecord {
  id: number; title: string; description: string | null; priorityRank: number;
  timeHorizon: GoalRow['time_horizon']; status: GoalStatus; domain: string | null;
  successSignals: string[]; antiGoals: string[]; version: number; createdAt: string; updatedAt: string;
}

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function parseJsonList(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

function mapGoal(row: GoalRow): ActivityGoalRecord {
  return {
    id: row.id, title: row.title, description: row.description, priorityRank: row.priority_rank,
    timeHorizon: row.time_horizon, status: row.status, domain: row.domain,
    successSignals: parseJsonList(row.success_signals), antiGoals: parseJsonList(row.anti_goals), version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function findGoal(userId: number, id: number): Promise<ActivityGoalRecord | null> {
  const [rows] = await pool.query(
    `SELECT id, title, description, priority_rank, time_horizon, status, domain, success_signals, anti_goals, version, created_at, updated_at
     FROM activity_goals WHERE id = ? AND user_id = ?`, [id, userId],
  );
  return Array.isArray(rows) && rows.length ? mapGoal(rows[0] as GoalRow) : null;
}

async function dirtyWeekly(userId: number): Promise<void> {
  await pool.query(
    `UPDATE weekly_activity_intelligence SET status = 'dirty', content = NULL, error_code = NULL
     WHERE user_id = ? AND status <> 'generating'`, [userId],
  );
}

export async function listActivityGoals(user: AuthenticatedUser, includeInactive = true): Promise<ActivityGoalRecord[]> {
  const filter = includeInactive ? '' : " AND status = 'active'";
  const [rows] = await pool.query(
    `SELECT id, title, description, priority_rank, time_horizon, status, domain, success_signals, anti_goals, version, created_at, updated_at
     FROM activity_goals WHERE user_id = ?${filter} ORDER BY priority_rank ASC, id ASC`, [user.id],
  );
  return Array.isArray(rows) ? rows.map((row) => mapGoal(row as GoalRow)) : [];
}

export async function createActivityGoal(user: AuthenticatedUser, payload: unknown): Promise<ActivityGoalRecord> {
  if (user.isAdmin) throw serviceError(403, 'admin account is read-only');
  const input: CreateActivityGoalInput = createActivityGoalSchema.parse(payload);
  const [result] = await pool.query(
    `INSERT INTO activity_goals (user_id, title, description, priority_rank, time_horizon, status, domain, success_signals, anti_goals)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, input.title, input.description ?? null, input.priorityRank, input.timeHorizon, input.status, input.domain ?? null, JSON.stringify(input.successSignals), JSON.stringify(input.antiGoals)],
  );
  const goal = await findGoal(user.id, Number((result as { insertId: number }).insertId));
  if (!goal) throw serviceError(500, 'goal was not created');
  await dirtyWeekly(user.id);
  return goal;
}

export async function updateActivityGoal(user: AuthenticatedUser, params: unknown, payload: unknown): Promise<ActivityGoalRecord> {
  if (user.isAdmin) throw serviceError(403, 'admin account is read-only');
  const { id } = activityGoalIdParamSchema.parse(params);
  const input = updateActivityGoalSchema.parse(payload);
  const fields: string[] = []; const values: unknown[] = [];
  const scalar = [['title', input.title], ['description', input.description], ['priority_rank', input.priorityRank], ['time_horizon', input.timeHorizon], ['status', input.status], ['domain', input.domain]] as const;
  for (const [name, value] of scalar) if (value !== undefined) { fields.push(`${name} = ?`); values.push(value); }
  if (input.successSignals !== undefined) { fields.push('success_signals = ?'); values.push(JSON.stringify(input.successSignals)); }
  if (input.antiGoals !== undefined) { fields.push('anti_goals = ?'); values.push(JSON.stringify(input.antiGoals)); }
  if (!fields.length) throw serviceError(400, 'no fields to update');
  fields.push('version = version + 1');
  const [result] = await pool.query(`UPDATE activity_goals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, [...values, id, user.id]);
  if (!Number((result as { affectedRows: number }).affectedRows)) throw serviceError(404, 'activity goal not found');
  const goal = await findGoal(user.id, id);
  if (!goal) throw serviceError(404, 'activity goal not found');
  await dirtyWeekly(user.id);
  return goal;
}

export async function archiveActivityGoal(user: AuthenticatedUser, params: unknown): Promise<ActivityGoalRecord> {
  return updateActivityGoal(user, params, { status: 'archived' });
}

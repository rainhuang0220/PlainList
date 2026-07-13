import type { AuthenticatedUser, PlanRecord } from '@plainlist/shared';
import { createPlanSchema, normalizePlanName, planIdParamSchema, toDateKey, updatePlanSchema } from '@plainlist/shared';
import { pool } from '../../db/pool';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

interface PlanRow {
  id: number;
  type: 'habit' | 'todo';
  name: string;
  description?: string | null;
  time: string;
  sort_order: number;
  scheduled_date?: string | Date | null;
  visible_from?: string | Date | null;
}

/**
 * The pool is configured with dateStrings for DATE columns, so values arrive
 * as 'YYYY-MM-DD'. The Date branch is a safety net and MUST use local time —
 * toISOString() would shift the day for non-UTC server timezones.
 */
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

const PLAN_SELECT = `
  SELECT p.id, p.type, p.name, p.description, p.time, p.sort_order, p.scheduled_date,
         DATE_FORMAT(LEAST(DATE(p.created_at), COALESCE(MIN(c.check_date), DATE(p.created_at))), '%Y-%m-%d') AS visible_from
  FROM plans p
  LEFT JOIN checks c ON c.plan_id = p.id
`;

function mapPlan(row: PlanRow): PlanRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description ?? null,
    time: row.time,
    sortOrder: row.sort_order,
    scheduledDate: row.type === 'todo' ? toLocalDateKey(row.scheduled_date) : null,
    visibleFrom: toLocalDateKey(row.visible_from),
  };
}

/** Habits collide on normalized name; todos on normalized name + scheduled day. */
function duplicateKey(plan: PlanRecord): string {
  if (plan.type === 'habit') {
    return `habit|${normalizePlanName(plan.name)}`;
  }

  return `todo|${normalizePlanName(plan.name)}|${plan.scheduledDate ?? ''}`;
}

/** Move the duplicate's checks onto the keeper (keeping any done=1), then delete it. */
async function mergePlanInto(keeperId: number, duplicateId: number): Promise<void> {
  await pool.query('UPDATE IGNORE checks SET plan_id = ? WHERE plan_id = ?', [keeperId, duplicateId]);
  await pool.query(
    `UPDATE checks k
     INNER JOIN checks d ON d.plan_id = ? AND k.check_date = d.check_date
     SET k.done = GREATEST(k.done, d.done)
     WHERE k.plan_id = ?`,
    [duplicateId, keeperId],
  );
  await pool.query('DELETE FROM plans WHERE id = ?', [duplicateId]);
}

/**
 * Collapse duplicate rows that accumulated in the DB (e.g. repeated AI-intake
 * commits inserting the same todos). Checks are merged into the surviving row
 * so completion history is not lost.
 */
async function pruneDuplicatePlans(user: AuthenticatedUser, plans: PlanRecord[]): Promise<PlanRecord[]> {
  const keeperByKey = new Map<string, PlanRecord>();
  const duplicates: Array<{ keeperId: number; duplicateId: number }> = [];

  for (const plan of [...plans].sort((left, right) => left.id - right.id)) {
    const key = duplicateKey(plan);
    const keeper = keeperByKey.get(key);
    if (keeper) {
      duplicates.push({ keeperId: keeper.id, duplicateId: plan.id });
    } else {
      keeperByKey.set(key, plan);
    }
  }

  if (duplicates.length === 0) {
    return plans;
  }

  if (!user.isAdmin) {
    for (const { keeperId, duplicateId } of duplicates) {
      await mergePlanInto(keeperId, duplicateId);
    }
  }

  const removeSet = new Set(duplicates.map((item) => item.duplicateId));
  return plans.filter((plan) => !removeSet.has(plan.id));
}

async function selectPlans(user: AuthenticatedUser, planId?: number): Promise<PlanRecord[]> {
  const conditions = ['p.user_id = ?'];
  const values: unknown[] = [user.id];

  if (planId !== undefined) {
    conditions.push('p.id = ?');
    values.push(planId);
  }

  const [rows] = await pool.query(
    `${PLAN_SELECT} WHERE ${conditions.join(' AND ')} GROUP BY p.id ORDER BY p.time, p.sort_order`,
    values,
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => mapPlan(row as PlanRow));
}

export async function listPlans(user: AuthenticatedUser): Promise<PlanRecord[]> {
  const plans = await selectPlans(user);
  return pruneDuplicatePlans(user, plans);
}

export async function createPlan(user: AuthenticatedUser, payload: unknown): Promise<PlanRecord> {
  if (user.isAdmin) {
    throw serviceError(403, 'admin account is read-only');
  }

  const input = createPlanSchema.parse(payload);
  const scheduledDate = input.type === 'todo'
    ? (input.scheduledDate ?? toDateKey(new Date()))
    : null;

  // Reuse an existing row instead of inserting a duplicate: habits match on
  // name; todos match on name + scheduled day (retried/repeated submissions).
  const existing = await selectPlans(user);
  const nameKey = normalizePlanName(input.name);
  const match = existing.find((plan) => {
    if (plan.type !== input.type || normalizePlanName(plan.name) !== nameKey) {
      return false;
    }

    return plan.type === 'habit' || plan.scheduledDate === scheduledDate;
  });

  if (match) {
    return match;
  }

  const description = input.description ?? null;
  const [result] = await pool.query(
    'INSERT INTO plans (user_id, type, name, description, time, scheduled_date) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, input.type, input.name, description, input.time, scheduledDate],
  );

  return {
    id: Number((result as { insertId: number }).insertId),
    type: input.type,
    name: input.name,
    description,
    time: input.time,
    sortOrder: 0,
    scheduledDate,
    visibleFrom: toDateKey(new Date()),
  };
}

export async function updatePlan(user: AuthenticatedUser, planIdInput: unknown, payload: unknown): Promise<PlanRecord> {
  if (user.isAdmin) {
    throw serviceError(403, 'admin account is read-only');
  }

  const { id } = planIdParamSchema.parse(planIdInput);
  const input = updatePlanSchema.parse(payload);

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name);
  }
  if (input.description !== undefined) {
    fields.push('description = ?');
    values.push(input.description);
  }
  if (input.type !== undefined) {
    fields.push('type = ?');
    values.push(input.type);
    if (input.type === 'habit') {
      fields.push('scheduled_date = NULL');
    } else if (input.type === 'todo') {
      fields.push('scheduled_date = ?');
      values.push(toDateKey(new Date()));
    }
  }
  if (input.time !== undefined) {
    fields.push('time = ?');
    values.push(input.time);
  }

  if (fields.length === 0) {
    throw serviceError(400, 'no fields to update');
  }

  values.push(id, user.id);
  const [result] = await pool.query(
    `UPDATE plans SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values,
  );

  if (Number((result as { affectedRows: number }).affectedRows) === 0) {
    throw serviceError(404, 'plan not found');
  }

  const [updated] = await selectPlans(user, id);
  if (!updated) {
    throw serviceError(404, 'plan not found after update');
  }

  return updated;
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

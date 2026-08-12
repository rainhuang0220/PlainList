import type { AuthenticatedUser } from '@plainlist/shared';
import {
  durationChartPrefsQuerySchema,
  durationChartPrefsSchema,
} from '@plainlist/shared';
import { pool } from '../../db/pool';

type PrefsBody = {
  hiddenPlanIds: number[];
  merges: Array<{ label: string; planIds: number[] }>;
};

const EMPTY_PREFS: PrefsBody = { hiddenPlanIds: [], merges: [] };

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapRow(row: { hidden_plan_ids: unknown; merges: unknown }): PrefsBody {
  return {
    hiddenPlanIds: parseJsonField<number[]>(row.hidden_plan_ids, []),
    merges: parseJsonField<PrefsBody['merges']>(row.merges, []),
  };
}

export async function getDurationChartPrefs(
  user: AuthenticatedUser,
  query: unknown,
): Promise<PrefsBody> {
  const parsed = durationChartPrefsQuerySchema.parse(query);

  const [rows] = await pool.query(
    `SELECT hidden_plan_ids, merges
     FROM duration_chart_prefs
     WHERE user_id = ? AND scope = ? AND scope_key = ?
     LIMIT 1`,
    [user.id, parsed.scope, parsed.scopeKey],
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...EMPTY_PREFS };
  }

  return mapRow(rows[0] as { hidden_plan_ids: unknown; merges: unknown });
}

export async function upsertDurationChartPrefs(
  user: AuthenticatedUser,
  query: unknown,
  payload: unknown,
): Promise<PrefsBody> {
  const parsedQuery = durationChartPrefsQuerySchema.parse(query);
  const body = durationChartPrefsSchema.parse(payload);

  await pool.query(
    `INSERT INTO duration_chart_prefs (user_id, scope, scope_key, hidden_plan_ids, merges)
     VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE
       hidden_plan_ids = VALUES(hidden_plan_ids),
       merges = VALUES(merges)`,
    [
      user.id,
      parsedQuery.scope,
      parsedQuery.scopeKey,
      JSON.stringify(body.hiddenPlanIds),
      JSON.stringify(body.merges),
    ],
  );

  return body;
}

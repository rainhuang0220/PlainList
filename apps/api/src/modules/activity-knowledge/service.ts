import type { AuthenticatedUser, AppendActivityDigestInput } from '@plainlist/shared';
import { appendActivityDigestSchema, canonicalHash, normalizeWeekStart } from '@plainlist/shared';
import { pool } from '../../db/pool';

interface SourceRow { id: number; content_hash: string; }
export interface DigestIngestResult { sourceId: number; factCount: number; created: boolean; affectedDates: string[]; }

function serviceError(status: number, message: string): Error & { status: number } { return Object.assign(new Error(message), { status }); }

function factCandidates(input: AppendActivityDigestInput): Array<{ key: string; dateKey: string; category: string; title: string; summary: string; output: 'produced' | 'partial' | 'not_applicable' | 'unknown'; exploration: 'explored' | 'not_applicable' | 'unknown' }> {
  if (input.localFacts?.length) return input.localFacts.map((fact, index) => ({ key: `local:${index}`, dateKey: fact.dateKey, category: fact.category, title: fact.title, summary: fact.title, output: fact.completed ? 'produced' : 'partial', exploration: fact.category === 'research' || fact.category === 'learning' ? 'explored' : 'not_applicable' }));
  const entries: Array<{ category: string; values: string[]; output: 'produced' | 'partial' | 'not_applicable' | 'unknown'; exploration: 'explored' | 'not_applicable' | 'unknown' }> = [
    { category: 'activity', values: input.activities, output: 'not_applicable', exploration: 'unknown' },
    { category: 'output', values: input.outputs, output: 'produced', exploration: 'not_applicable' },
    { category: 'learning', values: input.learnings, output: 'not_applicable', exploration: 'explored' },
    { category: 'decision', values: input.decisions, output: 'partial', exploration: 'not_applicable' },
    { category: 'unresolved', values: input.unresolved, output: 'unknown', exploration: 'unknown' },
  ];
  const candidates = entries.flatMap((entry) => entry.values.map((value, index) => ({
    key: `${entry.category}:${index}`, dateKey: input.dateKey, category: entry.category, title: value.slice(0, 240), summary: value.slice(0, 600), output: entry.output, exploration: entry.exploration,
  })));
  return candidates.length ? candidates : [{ key: 'summary:0', dateKey: input.dateKey, category: 'summary', title: input.summary.slice(0, 240), summary: input.summary.slice(0, 600), output: 'unknown', exploration: 'unknown' }];
}

async function invalidateRange(userId: number, from: string, to: string): Promise<void> {
  await pool.query(`UPDATE daily_activity_digests SET status = 'dirty', content = NULL, error_code = NULL WHERE user_id = ? AND date_key BETWEEN ? AND ?`, [userId, from, to]);
  await pool.query(`UPDATE weekly_activity_intelligence SET status = 'dirty', content = NULL, error_code = NULL WHERE user_id = ? AND source_date_from <= ? AND source_date_to >= ?`, [userId, to, from]);
}

async function invalidateDates(userId: number, dates: string[], invalidateChatgptJournal = false): Promise<void> {
  const uniqueDates = [...new Set(dates)].sort();
  if (!uniqueDates.length) return;
  const weeks = [...new Set(uniqueDates.map(normalizeWeekStart))];
  await pool.query(`UPDATE daily_activity_digests SET status = 'dirty', content = NULL, error_code = NULL WHERE user_id = ? AND date_key IN (${uniqueDates.map(() => '?').join(',')})`, [userId, ...uniqueDates]);
  await pool.query(`UPDATE weekly_activity_intelligence SET status = 'dirty', content = NULL, error_code = NULL WHERE user_id = ? AND week_start IN (${weeks.map(() => '?').join(',')})`, [userId, ...weeks]);
  if (invalidateChatgptJournal) {
    await pool.query(`UPDATE chatgpt_daily_journals SET status = 'dirty' WHERE user_id = ? AND journal_date IN (${uniqueDates.map(() => '?').join(',')})`, [userId, ...uniqueDates]);
  }
}

export async function appendActivityDigest(user: AuthenticatedUser, payload: unknown): Promise<DigestIngestResult> {
  if (user.isAdmin) throw serviceError(403, 'admin account is read-only');
  const input = appendActivityDigestSchema.parse(payload);
  const sourceType = input.sourceType ?? 'chatgpt-explicit-digest';
  const facts = factCandidates(input);
  const factDates = facts.map((fact) => fact.dateKey).sort();
  const dateStart = factDates[0] ?? input.dateKey;
  const dateEnd = factDates.at(-1) ?? input.dateKey;
  const contentHash = canonicalHash(input);
  const [existingRows] = await pool.query(
    `SELECT id, content_hash FROM activity_sources WHERE user_id = ? AND source_type = ? AND idempotency_key = ? LIMIT 1`,
    [user.id, sourceType, input.idempotencyKey],
  );
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] as SourceRow : null;
  if (existing?.content_hash === contentHash) return { sourceId: existing.id, factCount: 0, created: false, affectedDates: [] };

  let sourceId: number;
  let oldDates: string[] = [];
  if (existing) {
    sourceId = existing.id;
    const [oldDateRows] = await pool.query('SELECT date_key FROM activity_facts WHERE source_id = ? AND user_id = ?', [sourceId, user.id]);
    oldDates = Array.isArray(oldDateRows) ? (oldDateRows as Array<{ date_key: string }>).map((row) => row.date_key) : [];
    await pool.query(
      `UPDATE activity_sources SET external_id = ?, date_start = ?, date_end = ?, occurred_at = ?, schema_version = 'v1', compact_payload = ?, content_hash = ?, status = 'active', deleted_at = NULL WHERE id = ? AND user_id = ?`,
      [input.sourceExternalId, dateStart, dateEnd, input.occurredAt ?? null, JSON.stringify(input), contentHash, sourceId, user.id],
    );
    await pool.query('DELETE FROM activity_facts WHERE source_id = ? AND user_id = ?', [sourceId, user.id]);
  } else {
    const [result] = await pool.query(
      `INSERT INTO activity_sources (user_id, source_type, external_id, idempotency_key, date_start, date_end, occurred_at, schema_version, compact_payload, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'v1', ?, ?)`,
      [user.id, sourceType, input.sourceExternalId, input.idempotencyKey, dateStart, dateEnd, input.occurredAt ?? null, JSON.stringify(input), contentHash],
    );
    sourceId = Number((result as { insertId: number }).insertId);
  }

  for (const fact of facts) {
    const factHash = canonicalHash({ sourceHash: contentHash, fact });
    await pool.query(
      `INSERT INTO activity_facts (user_id, source_id, date_key, fact_key, category, title, summary, outcome, output_state, exploration_state, related_goal_ids, evidence, confidence, input_hash, fact_hash, extractor_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'medium', ?, ?, 'chatgpt-digest-v1')`,
      [user.id, sourceId, fact.dateKey, fact.key, fact.category, fact.title, fact.summary, fact.output, fact.exploration, JSON.stringify(input.candidateGoalRelations.map((item) => item.goalId)), JSON.stringify([{ source: sourceType, key: fact.key }]), contentHash, factHash],
    );
  }
  const affectedDates = [...new Set([...oldDates, ...factDates])].sort();
  await invalidateDates(user.id, affectedDates, sourceType === 'chatgpt-local-sync');
  return { sourceId, factCount: facts.length, created: !existing, affectedDates };
}

export async function deleteActivitySource(user: AuthenticatedUser, params: unknown): Promise<void> {
  const id = Number((params as { id?: unknown }).id);
  if (!Number.isInteger(id) || id <= 0) throw serviceError(400, 'invalid activity source id');
  const [dateRows] = await pool.query('SELECT date_key FROM activity_facts WHERE source_id = ? AND user_id = ?', [id, user.id]);
  const dates = Array.isArray(dateRows) ? (dateRows as Array<{ date_key: string }>).map((row) => row.date_key) : [];
  const [result] = await pool.query(
    `UPDATE activity_sources SET status = 'deleted', compact_payload = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status = 'active'`, [id, user.id],
  );
  if (!Number((result as { affectedRows: number }).affectedRows)) throw serviceError(404, 'activity source not found');
  await pool.query('DELETE FROM activity_facts WHERE source_id = ? AND user_id = ?', [id, user.id]);
  await invalidateDates(user.id, dates);
}

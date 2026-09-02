import type { WeeklySummaryContent } from '@plainlist/shared';
import { randomUUID } from 'node:crypto';
import type { ReviewSnapshot, ReviewSnapshotRepository } from './reviewSnapshotCoordinator';

export type SqlQuery = (sql: string, values?: unknown[]) => Promise<unknown>;

interface SnapshotRow {
  user_id: number;
  review_as_of_date: string;
  window_start_date: string;
  window_end_date: string;
  status: ReviewSnapshot['status'];
  content_json: string | null;
  generated_at: string | Date | null;
  model: string | null;
  provider: string | null;
  error_message: string | null;
  evidence_json?: string | null;
  evidence_hash?: string | null;
  prompt_version?: string | null;
  attempt_count?: number;
}

const SNAPSHOT_FIELDS = `
  user_id, review_as_of_date, window_start_date, window_end_date, status,
  content_json, generated_at, model, provider, error_message, evidence_json, evidence_hash, prompt_version, attempt_count
`;

function calendarDateKey(value: unknown): string {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
  const text = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text.slice(0, 10);
}

function toSnapshot(row: SnapshotRow): ReviewSnapshot {
  let content: WeeklySummaryContent | null = null;
  if (row.content_json) {
    try {
      content = JSON.parse(row.content_json) as WeeklySummaryContent;
    } catch {
      content = null;
    }
  }

  return {
    userId: Number(row.user_id),
    reviewAsOfDate: calendarDateKey(row.review_as_of_date),
    windowStartDate: calendarDateKey(row.window_start_date),
    windowEndDate: calendarDateKey(row.window_end_date),
    status: row.status,
    content,
    generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : null,
    model: row.model,
    provider: row.provider,
    errorMessage: row.error_message,
    evidence: row.evidence_json ? JSON.parse(row.evidence_json) : null,
    evidenceHash: row.evidence_hash ?? null,
    promptVersion: row.prompt_version ?? null,
    attemptCount: Number(row.attempt_count ?? 0),
  };
}

async function rowsFor(query: SqlQuery, sql: string, values: unknown[]): Promise<SnapshotRow[]> {
  const result = await query(sql, values) as [unknown];
  return Array.isArray(result[0]) ? result[0] as SnapshotRow[] : [];
}

export function createMysqlReviewSnapshotRepository(query: SqlQuery): ReviewSnapshotRepository {
  async function find(userId: number, reviewAsOfDate: string): Promise<ReviewSnapshot | null> {
    const rows = await rowsFor(query,
      `SELECT ${SNAPSHOT_FIELDS} FROM weekly_review_snapshots WHERE user_id = ? AND review_as_of_date = ?`,
      [userId, reviewAsOfDate]);
    return rows[0] ? toSnapshot(rows[0]) : null;
  }

  return {
    async ensure(input) {
      await query(
        `INSERT INTO weekly_review_snapshots
          (user_id, review_as_of_date, window_start_date, window_end_date, status)
         VALUES (?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE review_as_of_date = VALUES(review_as_of_date)`,
        [input.userId, input.reviewAsOfDate, input.windowStartDate, input.windowEndDate],
      );
      const snapshot = await find(input.userId, input.reviewAsOfDate);
      if (!snapshot) {
        throw new Error('review snapshot was not found after ensure');
      }
      return snapshot;
    },
    find,
    async findByWindow(userId, windowStartDate, windowEndDate) {
      const rows = await rowsFor(query,
        `SELECT ${SNAPSHOT_FIELDS} FROM weekly_review_snapshots
         WHERE user_id = ? AND window_start_date = ? AND window_end_date = ? AND status = 'ready'
         ORDER BY review_as_of_date DESC LIMIT 1`,
        [userId, windowStartDate, windowEndDate]);
      return rows[0] ? toSnapshot(rows[0]) : null;
    },
    async listClosedWeeks(userId, limit) {
      const rows = await rowsFor(query,
        `SELECT ${SNAPSHOT_FIELDS} FROM weekly_review_snapshots
         WHERE user_id = ? AND status = 'ready'
           AND DATEDIFF(window_end_date, window_start_date) = 6
         ORDER BY window_start_date DESC
         LIMIT ?`,
        [userId, Math.max(1, Math.min(limit, 52))]);
      return rows.map(toSnapshot);
    },
    async markDirty(userId, reviewAsOfDate) {
      await query(
        `UPDATE weekly_review_snapshots
         SET status = 'pending', attempt_count = 0, claim_token = NULL, lease_expires_at = NULL, error_message = NULL
         WHERE user_id = ? AND review_as_of_date = ? AND status IN ('ready', 'error')`,
        [userId, reviewAsOfDate],
      );
    },
    async claim(userId, reviewAsOfDate) {
      const claimToken = randomUUID();
      const result = await query(
        `UPDATE weekly_review_snapshots
         SET status = 'generating', error_message = NULL, attempt_count = attempt_count + 1,
             claim_token = ?, lease_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 6 MINUTE)
         WHERE user_id = ? AND review_as_of_date = ?
           AND (status IN ('pending', 'error')
                OR (status = 'generating' AND lease_expires_at < UTC_TIMESTAMP()))
           AND attempt_count < 2`,
        [claimToken, userId, reviewAsOfDate],
      ) as [{ affectedRows?: number }];
      return Number(result[0]?.affectedRows) === 1 ? claimToken : null;
    },
    async complete(userId, reviewAsOfDate, claimToken, result) {
      await query(
        `UPDATE weekly_review_snapshots
         SET status = 'ready', content_json = ?, evidence_json = ?, evidence_hash = ?, prompt_version = ?,
             generated_at = ?, model = ?, provider = ?, error_message = NULL, claim_token = NULL, lease_expires_at = NULL
         WHERE user_id = ? AND review_as_of_date = ? AND status = 'generating' AND claim_token = ?`,
        [
          JSON.stringify(result.content),
          JSON.stringify(result.evidence ?? null),
          result.evidenceHash ?? null,
          result.promptVersion ?? null,
          result.generatedAt,
          result.model,
          result.provider,
          userId,
          reviewAsOfDate,
          claimToken,
        ],
      );
      const snapshot = await find(userId, reviewAsOfDate);
      if (!snapshot) throw new Error('review snapshot was not found after completion');
      return snapshot;
    },
    async fail(userId, reviewAsOfDate, claimToken, errorMessage) {
      await query(
        `UPDATE weekly_review_snapshots
         SET status = 'error', error_message = ?, claim_token = NULL, lease_expires_at = NULL
         WHERE user_id = ? AND review_as_of_date = ? AND status = 'generating' AND claim_token = ?`,
        [errorMessage.slice(0, 500), userId, reviewAsOfDate, claimToken],
      );
      const snapshot = await find(userId, reviewAsOfDate);
      if (!snapshot) throw new Error('review snapshot was not found after failure');
      return snapshot;
    },
    async latestReady(userId) {
      const rows = await rowsFor(query,
        `SELECT ${SNAPSHOT_FIELDS} FROM weekly_review_snapshots
         WHERE user_id = ? AND status = 'ready'
         ORDER BY review_as_of_date DESC LIMIT 1`,
        [userId]);
      return rows[0] ? toSnapshot(rows[0]) : null;
    },
    async expireExhaustedLeases() {
      await query(
        `UPDATE weekly_review_snapshots
         SET status = 'error', error_message = 'review generation lease expired after maximum attempts',
             claim_token = NULL, lease_expires_at = NULL
         WHERE status = 'generating'
           AND lease_expires_at <= UTC_TIMESTAMP()
           AND attempt_count >= 2`,
      );
    },
  };
}

import {
  chatgptActivityReconcileSchema,
  dateKeySchema,
  type AuthenticatedUser,
} from '@plainlist/shared';
import { pool } from '../../db/pool';
import { renderChatgptDailyJournal, type ChatgptJournalFact } from './journal';
import { dirtyClosedWeekForJournalDate, generateCurrentWeeklyReviewSnapshot } from '../reviews/weeklyReviewSnapshot';

function dateValue(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

export async function reconcileChatgptActivity(user: AuthenticatedUser, payload: unknown) {
  if (user.isAdmin) throw Object.assign(new Error('admin account is read-only'), { status: 403 });
  const input = chatgptActivityReconcileSchema.parse(payload);
  const dates = new Set(input.affectedDates);
  if (input.historicalBootstrap) {
    const [historicalRows] = await pool.query(
      `SELECT DISTINCT f.date_key FROM activity_facts f
       INNER JOIN activity_sources s ON s.id = f.source_id
       WHERE f.user_id = ? AND s.user_id = ? AND s.source_type = 'chatgpt-local-sync' AND s.status = 'active'
       ORDER BY f.date_key`,
      [user.id, user.id],
    );
    for (const row of Array.isArray(historicalRows) ? historicalRows : []) dates.add(dateValue((row as any).date_key));
  }
  const journals: Array<{ date: string; status: 'ready' | 'final'; activityCount: number; conversationCount: number }> = [];

  for (const date of [...dates].sort()) {
    const [rows] = await pool.query(
      `SELECT f.id, f.source_id, f.category, f.title, f.output_state
       FROM activity_facts f
       INNER JOIN activity_sources s ON s.id = f.source_id
       WHERE f.user_id = ? AND f.date_key = ?
         AND s.user_id = ? AND s.source_type = 'chatgpt-local-sync' AND s.status = 'active'
       ORDER BY f.category, f.id`,
      [user.id, date, user.id],
    );
    const facts = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: Number((row as any).id),
      sourceId: Number((row as any).source_id),
      category: String((row as any).category),
      title: String((row as any).title),
      outputState: String((row as any).output_state),
    })) satisfies ChatgptJournalFact[];
    const journal = renderChatgptDailyJournal(date, facts);
    if (!journal.activityCount) {
      await pool.query('DELETE FROM chatgpt_daily_journals WHERE user_id = ? AND journal_date = ? AND source_type = ?', [user.id, date, 'chatgpt-local-sync']);
      continue;
    }
    const status = input.finalizeThrough && date <= input.finalizeThrough ? 'final' : 'ready';
    await pool.query(
      `INSERT INTO chatgpt_daily_journals
        (user_id, journal_date, source_type, status, summary_markdown, activity_count, conversation_count, source_version, generated_at)
       VALUES (?, ?, 'chatgpt-local-sync', ?, ?, ?, ?, 'journal-v1', CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE status = VALUES(status), summary_markdown = VALUES(summary_markdown),
         activity_count = VALUES(activity_count), conversation_count = VALUES(conversation_count),
         source_version = VALUES(source_version), generated_at = CURRENT_TIMESTAMP`,
      [user.id, date, status, journal.summaryMarkdown, journal.activityCount, journal.conversationCount],
    );
    journals.push({ date, status, activityCount: journal.activityCount, conversationCount: journal.conversationCount });
    await dirtyClosedWeekForJournalDate(user.id, date);
  }

  await pool.query(
    `INSERT INTO chatgpt_activity_connections
      (user_id, source_type, connection_status, last_synced_at, checked_count, changed_count, skipped_count)
     VALUES (?, 'chatgpt-local-sync', 'connected', CURRENT_TIMESTAMP, ?, ?, ?)
     ON DUPLICATE KEY UPDATE connection_status = 'connected', last_synced_at = CURRENT_TIMESTAMP,
       checked_count = VALUES(checked_count), changed_count = VALUES(changed_count), skipped_count = VALUES(skipped_count)`,
    [user.id, input.checked, input.changed, input.skipped],
  );
  await generateCurrentWeeklyReviewSnapshot(user).catch(() => undefined);
  return { journals };
}

export async function listChatgptDailyJournals(user: AuthenticatedUser, rawFrom: string, rawTo: string) {
  const from = dateKeySchema.parse(rawFrom);
  const to = dateKeySchema.parse(rawTo);
  if (from > to) throw Object.assign(new Error('invalid journal range'), { status: 400 });
  const [rows] = await pool.query(
    `SELECT journal_date, summary_markdown, activity_count, conversation_count, status, generated_at, updated_at
     FROM chatgpt_daily_journals
     WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND journal_date BETWEEN ? AND ?
     ORDER BY journal_date DESC`,
    [user.id, from, to],
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    date: dateValue((row as any).journal_date),
    summaryMarkdown: String((row as any).summary_markdown),
    activityCount: Number((row as any).activity_count),
    conversationCount: Number((row as any).conversation_count),
    status: String((row as any).status),
    generatedAt: (row as any).generated_at ? new Date((row as any).generated_at).toISOString() : null,
    updatedAt: new Date((row as any).updated_at).toISOString(),
  }));
}

export async function getChatgptActivityConnection(user: AuthenticatedUser) {
  const [rows] = await pool.query(
    `SELECT connection_status, last_synced_at, checked_count, changed_count, skipped_count
     FROM chatgpt_activity_connections WHERE user_id = ? AND source_type = 'chatgpt-local-sync' LIMIT 1`,
    [user.id],
  );
  const row = Array.isArray(rows) ? rows[0] as any : null;
  if (!row) return { status: 'not_connected', viaDesktop: false, lastSyncedAt: null };
  return {
    status: String(row.connection_status), viaDesktop: true,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    checked: Number(row.checked_count), changed: Number(row.changed_count), skipped: Number(row.skipped_count),
  };
}

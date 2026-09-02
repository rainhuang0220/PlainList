import {
  chatgptActivityProgressSchema,
  chatgptActivityReconcileSchema,
  dateKeySchema,
  DEFAULT_HISTORICAL_START_DATE,
  type AuthenticatedUser,
  type ChatgptActivityConnectionView,
  type ChatgptConnectionDisplayState,
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

export function chatgptConnectionDisplayState(input: {
  status: string;
  viaDesktop: boolean;
  journalCount: number;
  checked: number;
  processed?: number;
  lastSyncedAt?: string | null;
}): ChatgptConnectionDisplayState {
  if (!input.viaDesktop && input.status !== 'connected' && input.status !== 'paused') {
    return 'not_connected';
  }
  if (input.journalCount > 0) return 'ready';
  if (input.checked <= 0) return 'waiting_archive';
  const processed = input.processed ?? 0;
  const syncedAt = input.lastSyncedAt ? Date.parse(input.lastSyncedAt) : NaN;
  const recentlySynced = Number.isFinite(syncedAt) && Date.now() - syncedAt < 10 * 60 * 1000;
  if (recentlySynced && processed > 0 && processed < input.checked) return 'bootstrapping';
  return 'no_activity';
}

async function journalStats(userId: number) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS journal_count, MIN(journal_date) AS earliest, MAX(journal_date) AS latest
     FROM chatgpt_daily_journals
     WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND status IN ('ready', 'final')
       AND journal_date >= ?`,
    [userId, DEFAULT_HISTORICAL_START_DATE],
  );
  const row = Array.isArray(rows) ? rows[0] as { journal_count?: number; earliest?: unknown; latest?: unknown } : null;
  return {
    journalCount: Number(row?.journal_count ?? 0),
    earliestJournalDate: row?.earliest ? dateValue(row.earliest) : null,
    latestJournalDate: row?.latest ? dateValue(row.latest) : null,
  };
}

async function upsertConnection(
  userId: number,
  input: {
    checked: number;
    changed: number;
    skipped: number;
    processed?: number;
    historicalBootstrap?: boolean;
    bootstrapComplete?: boolean;
  },
) {
  const processed = input.processed ?? input.changed;
  await pool.query(
    `INSERT INTO chatgpt_activity_connections
      (user_id, source_type, connection_status, last_synced_at, checked_count, changed_count, skipped_count)
     VALUES (?, 'chatgpt-local-sync', 'connected', CURRENT_TIMESTAMP, ?, ?, ?)
     ON DUPLICATE KEY UPDATE connection_status = 'connected', last_synced_at = CURRENT_TIMESTAMP,
       checked_count = VALUES(checked_count), changed_count = VALUES(changed_count), skipped_count = VALUES(skipped_count)`,
    [userId, input.checked, processed, input.skipped],
  );
}

export async function reportChatgptActivityProgress(user: AuthenticatedUser, payload: unknown) {
  if (user.isAdmin) throw Object.assign(new Error('admin account is read-only'), { status: 403 });
  const input = chatgptActivityProgressSchema.parse(payload);
  await upsertConnection(user.id, input);
  return getChatgptActivityConnection(user);
}

export async function reconcileChatgptActivity(user: AuthenticatedUser, payload: unknown) {
  if (user.isAdmin) throw Object.assign(new Error('admin account is read-only'), { status: 403 });
  const input = chatgptActivityReconcileSchema.parse(payload);
  const dates = new Set(input.affectedDates.filter((date) => date >= DEFAULT_HISTORICAL_START_DATE));
  if (input.historicalBootstrap) {
    const [historicalRows] = await pool.query(
      `SELECT DISTINCT f.date_key FROM activity_facts f
       INNER JOIN activity_sources s ON s.id = f.source_id
       WHERE f.user_id = ? AND s.user_id = ? AND s.source_type = 'chatgpt-local-sync' AND s.status = 'active'
         AND f.date_key >= ?
       ORDER BY f.date_key`,
      [user.id, user.id, DEFAULT_HISTORICAL_START_DATE],
    );
    for (const row of Array.isArray(historicalRows) ? historicalRows : []) dates.add(dateValue((row as any).date_key));
  }
  const journals: Array<{ date: string; status: 'ready' | 'final'; activityCount: number; conversationCount: number }> = [];

  for (const date of [...dates].sort()) {
    if (date < DEFAULT_HISTORICAL_START_DATE) continue;
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

  await upsertConnection(user.id, input);
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

export async function getChatgptActivityConnection(user: AuthenticatedUser): Promise<ChatgptActivityConnectionView> {
  const [rows] = await pool.query(
    `SELECT connection_status, last_synced_at, checked_count, changed_count, skipped_count
     FROM chatgpt_activity_connections WHERE user_id = ? AND source_type = 'chatgpt-local-sync' LIMIT 1`,
    [user.id],
  );
  const stats = await journalStats(user.id);
  const row = Array.isArray(rows) ? rows[0] as any : null;
  if (!row) {
    return {
      status: 'not_connected',
      viaDesktop: false,
      lastSyncedAt: null,
      journalCount: stats.journalCount,
      earliestJournalDate: stats.earliestJournalDate,
      latestJournalDate: stats.latestJournalDate,
      historicalStartDate: DEFAULT_HISTORICAL_START_DATE,
      displayState: chatgptConnectionDisplayState({
        status: 'not_connected', viaDesktop: false, journalCount: stats.journalCount, checked: 0,
      }),
    };
  }
  const status = 'connected' as const;
  const checked = Number(row.checked_count);
  const changed = Number(row.changed_count);
  const lastSyncedAt = row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null;
  return {
    status,
    viaDesktop: true,
    lastSyncedAt,
    checked,
    changed,
    skipped: Number(row.skipped_count),
    processed: changed,
    journalCount: stats.journalCount,
    earliestJournalDate: stats.earliestJournalDate,
    latestJournalDate: stats.latestJournalDate,
    historicalStartDate: DEFAULT_HISTORICAL_START_DATE,
    displayState: chatgptConnectionDisplayState({
      status,
      viaDesktop: true,
      journalCount: stats.journalCount,
      checked,
      processed: changed,
      lastSyncedAt,
    }),
  };
}

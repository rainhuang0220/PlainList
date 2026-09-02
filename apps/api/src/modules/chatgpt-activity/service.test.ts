import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../reviews/weeklyReviewSnapshot', () => ({
  dirtyClosedWeekForJournalDate: vi.fn().mockResolvedValue(undefined),
  generateCurrentWeeklyReviewSnapshot: vi.fn().mockResolvedValue(null),
}));
vi.mock('../ai-intake/settings', () => ({
  resolveAiConfigForUser: vi.fn().mockResolvedValue(null),
}));
vi.mock('../ai-shared/llm', () => ({
  chatComplete: vi.fn(),
  aiProviderConfigured: () => false,
}));

import {
  chatgptConnectionDisplayState,
  getChatgptActivityConnection,
  listChatgptDailyJournals,
  reconcileChatgptActivity,
  recomposeHistoricalDailyJournals,
} from './service';
import { DAILY_JOURNAL_SOURCE_VERSION } from './journal';
import { dirtyClosedWeekForJournalDate, generateCurrentWeeklyReviewSnapshot } from '../reviews/weeklyReviewSnapshot';

const user = { id: 7, username: 'reader', isAdmin: false };

function sourceRow(input: {
  id: number;
  source_id: number;
  date: string;
  summary: string;
  title?: string;
  category?: string;
  output_state?: string;
  status?: 'completed' | 'progress' | 'planned' | 'discussed';
}) {
  const status = input.status
    ?? (input.output_state === 'produced' ? 'completed' : 'progress');
  return {
    id: input.id,
    source_id: input.source_id,
    category: input.category ?? 'engineering',
    title: input.title ?? '推进工程工作',
    summary: input.summary,
    output_state: input.output_state ?? 'partial',
    compact_payload: {
      dailySemanticFacts: [{
        topic: input.summary.includes('登录') ? '登录' : 'PlainList',
        status,
        summary: input.summary,
        dateKey: input.date,
      }],
    },
  };
}

describe('ChatGPT activity journal service', () => {
  beforeEach(() => {
    query.mockReset();
    vi.mocked(dirtyClosedWeekForJournalDate).mockClear();
    vi.mocked(generateCurrentWeeklyReviewSnapshot).mockClear();
  });

  it('persists one derived journal for multiple same-day conversations without raw transcript fields', async () => {
    query
      .mockResolvedValueOnce([[
        sourceRow({ id: 1, source_id: 10, date: '2026-09-01', summary: '继续排查了桌面端的登录问题。' }),
        sourceRow({ id: 2, source_id: 11, date: '2026-09-01', summary: '完成了资料整理并核对了结果。', output_state: 'produced' }),
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await reconcileChatgptActivity(user, {
      affectedDates: ['2026-09-01'],
      finalizeThrough: '2026-09-01',
      checked: 2,
      changed: 2,
      skipped: 0,
    });

    expect(result.journals).toMatchObject([{ date: '2026-09-01', status: 'final', activityCount: 2, conversationCount: 2 }]);
    const journalWrite = query.mock.calls.find(([sql]) => /INSERT INTO chatgpt_daily_journals/i.test(String(sql)));
    const markdown = (journalWrite?.[1] as unknown[]).find((value) => typeof value === 'string' && value.includes('登录'));
    expect(String(markdown)).toContain('登录');
    expect(String(markdown)).toMatch(/完成了|继续/);
    expect(String(markdown)).not.toContain('## ');
    expect(journalWrite?.[1]).toContain(DAILY_JOURNAL_SOURCE_VERSION);
    expect(JSON.stringify(journalWrite?.[1])).not.toMatch(/messages|transcript|cookie|session/i);
  });

  it('lists server-derived journals for web and mobile without source payloads', async () => {
    query.mockResolvedValueOnce([[
      { journal_date: '2026-09-01', summary_markdown: '今天主要完成了登录回归测试。', activity_count: 2, conversation_count: 2, status: 'final', generated_at: '2026-09-01T16:00:00.000Z', updated_at: '2026-09-01T16:00:00.000Z' },
    ]]);

    const result = await listChatgptDailyJournals(user, '2026-09-01', '2026-09-01');

    expect(result[0]).toMatchObject({ date: '2026-09-01', summaryMarkdown: '今天主要完成了登录回归测试。', activityCount: 2, conversationCount: 2, status: 'final' });
    expect(JSON.stringify(result)).not.toMatch(/compact_payload|messages|transcript/i);
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(String(sql)))).toBe(false);
  });

  it('reconciles every historical fact date during first bootstrap and finalizes past days', async () => {
    query
      .mockResolvedValueOnce([[{ date_key: '2026-08-30' }, { date_key: '2026-08-31' }]])
      .mockResolvedValueOnce([[sourceRow({ id: 1, source_id: 10, date: '2026-08-30', summary: '继续推进 PlainList 的工程修复。' })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[sourceRow({ id: 2, source_id: 11, date: '2026-08-31', summary: '完成了研究资料整理并核对了结果。', output_state: 'produced' })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await reconcileChatgptActivity(user, {
      affectedDates: [], historicalBootstrap: true, finalizeThrough: '2026-08-31',
      checked: 2, changed: 2, skipped: 0,
    });

    expect(result.journals.map((journal) => journal.date)).toEqual(['2026-08-30', '2026-08-31']);
    expect(result.journals.every((journal) => journal.status === 'final')).toBe(true);
    expect(query.mock.calls.filter(([sql]) => /INSERT INTO chatgpt_daily_journals/i.test(String(sql)))).toHaveLength(2);
  });

  it('does not materialize journals before the 2026-08-01 historical floor', async () => {
    query
      .mockResolvedValueOnce([[sourceRow({ id: 1, source_id: 10, date: '2026-08-01', summary: '继续推进 PlainList 的工程修复。' })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await reconcileChatgptActivity(user, {
      affectedDates: ['2026-07-20', '2026-08-01'],
      finalizeThrough: '2026-08-31',
      checked: 2,
      changed: 2,
      skipped: 0,
    });

    expect(result.journals.map((journal) => journal.date)).toEqual(['2026-08-01']);
    expect(query.mock.calls.some(([sql, values]) => (
      /SELECT[\s\S]*FROM activity_facts/i.test(String(sql)) && Array.isArray(values) && values.includes('2026-07-20')
    ))).toBe(false);
  });

  it('exposes connection metadata without transcripts', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ journal_count: 0, earliest: null, latest: null }]]);

    const result = await getChatgptActivityConnection(user);
    expect(result).toMatchObject({
      status: 'not_connected',
      displayState: 'not_connected',
      historicalStartDate: '2026-08-01',
      journalCount: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/transcript|apiKey|cookie/i);
  });

  it('lets an admin persist their own journals and never writes another user id', async () => {
    const admin = { id: 2, username: 'owner', isAdmin: true };
    query
      .mockResolvedValueOnce([[sourceRow({ id: 1, source_id: 10, date: '2026-08-31', summary: '继续推进 PlainList 的工程修复。' })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await reconcileChatgptActivity(admin, {
      affectedDates: ['2026-08-31'],
      finalizeThrough: '2026-08-31',
      checked: 1,
      changed: 1,
      skipped: 0,
    });

    expect(result.journals.map((journal) => journal.date)).toEqual(['2026-08-31']);
    const writes = query.mock.calls.filter(([sql]) => /INSERT INTO chatgpt_daily_journals|chatgpt_activity_connections/i.test(String(sql)));
    expect(writes.length).toBeGreaterThan(0);
    for (const [, values] of writes) {
      expect(values?.[0]).toBe(2);
      expect(values).not.toContain(7);
    }
  });

  it('recompose presentation without dirtying closed weekly summaries', async () => {
    query
      .mockResolvedValueOnce([[sourceRow({
        id: 1,
        source_id: 10,
        date: '2026-08-31',
        summary: '完成了周回顾空状态的修复。',
        output_state: 'produced',
      })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await reconcileChatgptActivity(user, {
      affectedDates: ['2026-08-31'],
      finalizeThrough: '2026-08-31',
      checked: 1,
      changed: 1,
      skipped: 0,
      historicalBootstrap: false,
      presentationOnly: true,
    });

    expect(dirtyClosedWeekForJournalDate).not.toHaveBeenCalled();
    expect(generateCurrentWeeklyReviewSnapshot).not.toHaveBeenCalled();
  });

  it('ignores keyword activity titles when composing Daily journals', async () => {
    query
      .mockResolvedValueOnce([[{ date_key: '2026-08-31' }]])
      .mockResolvedValueOnce([[{
        id: 1,
        source_id: 10,
        category: 'engineering',
        title: '推进PlainList UI 历史 Daily',
        summary: '推进PlainList UI 历史 Daily',
        output_state: 'produced',
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await recomposeHistoricalDailyJournals(user, { tryModel: false });
    expect(result.upgraded).toBe(0);
    expect(query.mock.calls.some(([sql]) => /INSERT INTO chatgpt_daily_journals/i.test(String(sql)))).toBe(false);
  });

  it('force-recomposes historical daily journals from compact facts and upgrades source_version', async () => {
    query
      .mockResolvedValueOnce([[{ date_key: '2026-08-31' }]])
      .mockResolvedValueOnce([[sourceRow({
        id: 1,
        source_id: 10,
        date: '2026-08-31',
        summary: '完成了 PlainList 桌面同步验收。',
        output_state: 'produced',
      })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await recomposeHistoricalDailyJournals(user, { tryModel: false });

    expect(result.upgraded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.sourceVersion).toBe(DAILY_JOURNAL_SOURCE_VERSION);
    expect(DAILY_JOURNAL_SOURCE_VERSION).toBe('journal-v5');
    expect(query.mock.calls.some(([sql, values]) => (
      /INSERT INTO chatgpt_daily_journals/i.test(String(sql)) && Array.isArray(values) && values.includes('journal-v5')
    ))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /source_version <>/.test(String(sql)))).toBe(false);
    expect(dirtyClosedWeekForJournalDate).not.toHaveBeenCalled();
    expect(generateCurrentWeeklyReviewSnapshot).not.toHaveBeenCalled();
  });

  it('does not recompose historical journals during ordinary reconcile', async () => {
    query
      .mockResolvedValueOnce([[sourceRow({
        id: 1,
        source_id: 10,
        date: '2026-08-31',
        summary: '完成了 PlainList 桌面同步验收。',
        output_state: 'produced',
      })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await reconcileChatgptActivity(user, {
      affectedDates: ['2026-08-31'],
      finalizeThrough: '2026-08-31',
      checked: 1,
      changed: 1,
      skipped: 0,
    });

    expect(query.mock.calls.some(([sql]) => /SELECT DISTINCT f.date_key/.test(String(sql)))).toBe(false);
  });

  it('rejects a foreign userId field on reconcile so one account cannot write another', async () => {
    await expect(reconcileChatgptActivity(user, {
      affectedDates: ['2026-08-31'],
      checked: 1,
      changed: 1,
      skipped: 0,
      userId: 99,
    })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('chatgptConnectionDisplayState', () => {
  it('keeps bootstrapping, empty, and ready states distinct', () => {
    expect(chatgptConnectionDisplayState({
      status: 'not_connected', viaDesktop: false, journalCount: 0, checked: 0,
    })).toBe('not_connected');
    expect(chatgptConnectionDisplayState({
      status: 'connected', viaDesktop: true, journalCount: 0, checked: 0,
    })).toBe('waiting_archive');
    expect(chatgptConnectionDisplayState({
      status: 'connected',
      viaDesktop: true,
      journalCount: 0,
      checked: 40,
      processed: 12,
      lastSyncedAt: new Date().toISOString(),
    })).toBe('bootstrapping');
    expect(chatgptConnectionDisplayState({
      status: 'connected', viaDesktop: true, journalCount: 0, checked: 40, processed: 40,
    })).toBe('no_activity');
    expect(chatgptConnectionDisplayState({
      status: 'connected', viaDesktop: true, journalCount: 12, checked: 40,
    })).toBe('ready');
  });
});

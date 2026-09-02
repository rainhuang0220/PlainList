import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

import { listChatgptDailyJournals, reconcileChatgptActivity } from './service';

const user = { id: 7, username: 'reader', isAdmin: false };

describe('ChatGPT activity journal service', () => {
  beforeEach(() => query.mockReset());

  it('persists one derived journal for multiple same-day conversations without raw transcript fields', async () => {
    query
      .mockResolvedValueOnce([[
        { id: 1, source_id: 10, category: 'engineering', title: '排查登录问题', output_state: 'partial' },
        { id: 2, source_id: 11, category: 'research', title: '完成资料整理', output_state: 'produced' },
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

    expect(result.journals).toEqual([{ date: '2026-09-01', status: 'final', activityCount: 2, conversationCount: 2 }]);
    const journalWrite = query.mock.calls.find(([sql]) => /INSERT INTO chatgpt_daily_journals/i.test(String(sql)));
    expect((journalWrite?.[1] as unknown[])?.some((value) => typeof value === 'string' && value.includes('## 今日 ChatGPT 活动'))).toBe(true);
    expect(JSON.stringify(journalWrite?.[1])).not.toMatch(/messages|transcript|cookie|session/i);
  });

  it('lists server-derived journals for web and mobile without source payloads', async () => {
    query.mockResolvedValueOnce([[
      { journal_date: '2026-09-01', summary_markdown: '## 今日 ChatGPT 活动', activity_count: 2, conversation_count: 2, status: 'final', generated_at: '2026-09-01T16:00:00.000Z', updated_at: '2026-09-01T16:00:00.000Z' },
    ]]);

    const result = await listChatgptDailyJournals(user, '2026-09-01', '2026-09-01');

    expect(result[0]).toMatchObject({ date: '2026-09-01', summaryMarkdown: '## 今日 ChatGPT 活动', activityCount: 2, conversationCount: 2, status: 'final' });
    expect(JSON.stringify(result)).not.toMatch(/compact_payload|messages|transcript/i);
  });

  it('reconciles every historical fact date during first bootstrap and finalizes past days', async () => {
    query
      .mockResolvedValueOnce([[{ date_key: '2026-08-30' }, { date_key: '2026-08-31' }]])
      .mockResolvedValueOnce([[{ id: 1, source_id: 10, category: 'engineering', title: '推进工程工作', output_state: 'partial' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 2, source_id: 11, category: 'research', title: '完成研究整理', output_state: 'produced' }]])
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
});

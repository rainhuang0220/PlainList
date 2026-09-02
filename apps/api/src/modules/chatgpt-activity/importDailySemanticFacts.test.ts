import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

import { importDailySemanticFacts } from './importDailySemanticFacts';
import { dirtyClosedWeekForJournalDate, generateCurrentWeeklyReviewSnapshot } from '../reviews/weeklyReviewSnapshot';

vi.mock('../reviews/weeklyReviewSnapshot', () => ({
  dirtyClosedWeekForJournalDate: vi.fn(),
  generateCurrentWeeklyReviewSnapshot: vi.fn(),
}));

const user = { id: 2, username: 'owner', isAdmin: true };

describe('importDailySemanticFacts', () => {
  beforeEach(() => {
    query.mockReset();
    vi.mocked(dirtyClosedWeekForJournalDate).mockClear();
    vi.mocked(generateCurrentWeeklyReviewSnapshot).mockClear();
  });

  it('patches compact_payload only and never rewrites activity facts or weekly snapshots', async () => {
    query
      .mockResolvedValueOnce([[{
        id: 44,
        compact_payload: { summary: '从 ChatGPT 本地对话中提取到有意义的用户活动。', localFacts: [{ title: '完成PlainList scheduler' }] },
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await importDailySemanticFacts(user, {
      'conv-1': [{
        topic: 'PlainList',
        status: 'completed',
        summary: '完成了 PlainList scheduler 的 stale lease 修复，并补了回归测试。',
        dateKey: '2026-08-31',
        sourceConversationId: 'conv-1',
      }],
    });

    expect(result).toEqual({ updated: 1, skipped: 0 });
    expect(query.mock.calls.some(([sql]) => /UPDATE activity_sources SET compact_payload/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /DELETE FROM activity_facts|INSERT INTO activity_facts/i.test(String(sql)))).toBe(false);
    expect(query.mock.calls.some(([sql]) => /weekly_activity_intelligence|weekly_review/i.test(String(sql)))).toBe(false);
    expect(dirtyClosedWeekForJournalDate).not.toHaveBeenCalled();
    expect(generateCurrentWeeklyReviewSnapshot).not.toHaveBeenCalled();
    const update = query.mock.calls.find(([sql]) => /UPDATE activity_sources SET compact_payload/i.test(String(sql)));
    const payload = JSON.parse(String(update?.[1]?.[0]));
    expect(payload.localFacts[0].title).toBe('完成PlainList scheduler');
    expect(payload.dailySemanticFacts[0].summary).toMatch(/stale lease 修复/);
    expect(JSON.stringify(payload)).not.toMatch(/transcript|messages/i);
  });
});

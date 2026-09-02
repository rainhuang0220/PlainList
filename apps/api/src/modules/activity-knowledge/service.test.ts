import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '@plainlist/shared';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

import { appendActivityDigest, deleteActivitySource } from './service';

const user = { id: 7, username: 'reader', isAdmin: false };
const digest = {
  sourceExternalId: 'chat-123', idempotencyKey: 'digest-123', dateKey: '2026-08-30',
  summary: '完成 remote MCP 方案并确认安全边界。', activities: ['研究官方 MCP'], outputs: ['完成 ADR'], learnings: ['普通历史不可读取'], decisions: ['显式保存'], unresolved: [],
  candidateGoalRelations: [],
};

describe('activity digest ingestion', () => {
  beforeEach(() => query.mockReset());

  it('is idempotent for an unchanged explicit digest and does not duplicate facts', async () => {
    query.mockResolvedValueOnce([[{ id: 44, content_hash: canonicalHash(digest) }]]);

    await expect(appendActivityDigest(user, digest)).resolves.toEqual({ sourceId: 44, factCount: 0, created: false, affectedDates: [] });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/idempotency_key/i);
    expect(query.mock.calls[0]?.[1]).toContain(7);
  });

  it('invalidates the union of old and new source fact dates on update', async () => {
    query.mockResolvedValueOnce([[{ id: 44, content_hash: 'old-hash' }]])
      .mockResolvedValueOnce([[{ date_key: '2026-08-29' }, { date_key: '2026-08-30' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValue([{ affectedRows: 1 }]);
    const changed = { ...digest, sourceType: 'chatgpt-local-sync' as const, summary: '更新后的摘要', dateKey: '2026-08-31' };
    await appendActivityDigest(user, changed);
    const daily = query.mock.calls.find(([sql]) => /UPDATE daily_activity_digests/i.test(String(sql)));
    expect(daily?.[1]).toEqual([7, '2026-08-29', '2026-08-30', '2026-08-31']);
    const weekly = query.mock.calls.find(([sql]) => /UPDATE weekly_activity_intelligence/i.test(String(sql)));
    expect(weekly?.[1]).toEqual([7, '2026-08-24', '2026-08-31']);
    const journals = query.mock.calls.find(([sql]) => /UPDATE chatgpt_daily_journals/i.test(String(sql)));
    expect(journals?.[1]).toEqual([7, '2026-08-29', '2026-08-30', '2026-08-31']);
  });

  it('replaces one stable local conversation source while preserving fact dates across days', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ insertId: 88 }]).mockResolvedValue({ affectedRows: 1 });
    await appendActivityDigest(user, {
      ...digest,
      sourceType: 'chatgpt-local-sync',
      sourceExternalId: 'conversation-stable-id',
      idempotencyKey: 'local-conversation-stable-id',
      localFacts: [
        { dateKey: '2026-08-30', category: 'engineering', title: '开展软件工程工作', completed: false },
        { dateKey: '2026-08-31', category: 'engineering', title: '排查并修复软件工程问题', completed: true },
      ],
    });
    const sourceInsert = query.mock.calls.find(([sql]) => /INSERT INTO activity_sources/i.test(String(sql)));
    expect(sourceInsert?.[1]).toContain('chatgpt-local-sync');
    const factDates = query.mock.calls.filter(([sql]) => /INSERT INTO activity_facts/i.test(String(sql))).map(([, values]) => values?.[2]);
    expect(factDates).toEqual(['2026-08-30', '2026-08-31']);
  });

  it('tombstones a source and dirties only its fact dates and weeks', async () => {
    query.mockResolvedValueOnce([[{ date_key: '2026-08-30' }, { date_key: '2026-08-31' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(deleteActivitySource(user, { id: 44 })).resolves.toBeUndefined();
    expect(String(query.mock.calls[1]?.[0])).toMatch(/WHERE id = \? AND user_id = \?/i);
    expect(query.mock.calls[1]?.[1]).toEqual([44, 7]);
    expect(query.mock.calls.some(([sql]) => /DELETE FROM activity_facts/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /daily_activity_digests/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /weekly_activity_intelligence/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.every(([sql]) => !/WHERE user_id = \?\s*$/i.test(String(sql)) || !/daily_activity_digests|weekly_activity_intelligence/i.test(String(sql)))).toBe(true);
  });
});

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

    await expect(appendActivityDigest(user, digest)).resolves.toEqual({ sourceId: 44, factCount: 0, created: false });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/idempotency_key/i);
    expect(query.mock.calls[0]?.[1]).toContain(7);
  });

  it('tombstones only the owners source, clears payload, removes facts, and dirties derived data', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValue([{ affectedRows: 1 }]).mockResolvedValue([{ affectedRows: 1 }]).mockResolvedValue([{ affectedRows: 1 }]);

    await expect(deleteActivitySource(user, { id: 44 })).resolves.toBeUndefined();
    expect(String(query.mock.calls[0]?.[0])).toMatch(/WHERE id = \? AND user_id = \?/i);
    expect(query.mock.calls[0]?.[1]).toEqual([44, 7]);
    expect(query.mock.calls.some(([sql]) => /DELETE FROM activity_facts/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /daily_activity_digests/i.test(String(sql)))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /weekly_activity_intelligence/i.test(String(sql)))).toBe(true);
  });
});

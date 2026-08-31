import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

import { WEEK_CONTEXT_MAX_BYTES, getWeekContext } from './context';

const user = { id: 7, username: 'reader', isAdmin: false };
const weeklyContent = {
  weekStart: '2026-08-24', progress: 'advanced', alignment: 'supporting', output: 'produced',
  exploration: 'explored', opportunityCost: 'evidenced', summary: '完成了协议封板。',
  outputs: ['MCP contract'], openLoops: ['local smoke'], suggestedNextFocus: ['Finish OAuth'],
  evidenceFactIds: [11], unknowns: [], rawTranscript: 'must never escape',
};

describe('compact MCP week context', () => {
  beforeEach(() => query.mockReset());

  it('returns tenant-scoped ready weekly intelligence and active goals without raw source data', async () => {
    query.mockResolvedValueOnce([[{ status: 'ready', content: JSON.stringify(weeklyContent), generated_at: '2026-08-30 10:00:00' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{
        id: 3, title: 'Publish research', description: 'Write the paper', priority_rank: 0,
        time_horizon: 'near_term', domain: 'research', success_signals: JSON.stringify(['submitted']),
      }]]);

    const result = await getWeekContext(user, '2026-08-30');

    expect(result).toMatchObject({ weekStart: '2026-08-24', status: 'ready', goals: [{ id: 3, title: 'Publish research' }] });
    expect(result.intelligence).toMatchObject({ progress: 'advanced', goalAlignment: 'supporting' });
    expect(JSON.stringify(result)).not.toMatch(/rawTranscript|message history|compact_payload/i);
    expect(query.mock.calls.every(([, params]) => !Array.isArray(params) || params[0] === 7)).toBe(true);
    expect(query.mock.calls.some(([sql]) => /activity_sources|activity_facts/i.test(String(sql)))).toBe(false);
  });

  it('returns bounded compact daily fallback for a stale or missing weekly projection without generating AI', async () => {
    const large = 'x'.repeat(4000);
    query.mockResolvedValueOnce([[{ status: 'dirty', content: null, generated_at: null }]])
      .mockResolvedValueOnce([[...Array.from({ length: 7 }, (_, index) => ({
        date_key: `2026-08-${24 + index}`,
        content: JSON.stringify({ dateKey: `2026-08-${24 + index}`, mainProgress: large,
          outputs: [large, large, large], learnings: [large], unresolved: [large], evidenceFactIds: [index + 1] }),
      }))]])
      .mockResolvedValueOnce([[]]);

    const result = await getWeekContext(user, '2026-08-24');

    expect(result.status).toBe('dirty');
    expect(result.daily).toHaveLength(7);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(WEEK_CONTEXT_MAX_BYTES);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('enforces the byte budget for multibyte persisted weekly content', async () => {
    const multibyte = '研究'.repeat(2000);
    query.mockResolvedValueOnce([[{ status: 'ready', content: JSON.stringify({
      ...weeklyContent, summary: multibyte,
      outputs: Array.from({ length: 12 }, () => multibyte),
      openLoops: Array.from({ length: 12 }, () => multibyte),
      suggestedNextFocus: Array.from({ length: 5 }, () => multibyte),
      unknowns: Array.from({ length: 12 }, () => multibyte),
    }), generated_at: null }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await getWeekContext(user, '2026-08-24');
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(WEEK_CONTEXT_MAX_BYTES);
    expect(result.intelligence?.summary).toBeTruthy();
  });
});

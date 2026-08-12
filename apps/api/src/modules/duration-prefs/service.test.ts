import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../../db/pool', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

import { getDurationChartPrefs, upsertDurationChartPrefs } from './service';

const user = { id: 1, username: 't', isAdmin: false };

describe('duration chart prefs service', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('get returns empty defaults when no row', async () => {
    query.mockResolvedValueOnce([[]]);

    await expect(
      getDurationChartPrefs(user, { scope: 'week', scopeKey: '2026-W33' }),
    ).resolves.toEqual({ hiddenPlanIds: [], merges: [] });
  });

  it('get maps stored json prefs', async () => {
    query.mockResolvedValueOnce([[{
      hidden_plan_ids: [3, 5],
      merges: [{ label: '学习', planIds: [1, 2] }],
    }]]);

    await expect(
      getDurationChartPrefs(user, { scope: 'month', scopeKey: '2026-08' }),
    ).resolves.toEqual({
      hiddenPlanIds: [3, 5],
      merges: [{ label: '学习', planIds: [1, 2] }],
    });
  });

  it('put upserts and returns body', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const body = {
      hiddenPlanIds: [9],
      merges: [{ label: '运动', planIds: [4, 5] }],
    };

    await expect(
      upsertDurationChartPrefs(user, { scope: 'year', scopeKey: '2026' }, body),
    ).resolves.toEqual(body);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO duration_chart_prefs/i),
      [1, 'year', '2026', JSON.stringify([9]), JSON.stringify(body.merges)],
    );
  });
});

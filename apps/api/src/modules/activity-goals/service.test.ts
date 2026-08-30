import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

import { archiveActivityGoal, createActivityGoal, updateActivityGoal } from './service';

const owner = { id: 1, username: 'owner', isAdmin: false };
const other = { id: 2, username: 'other', isAdmin: false };
const payload = { title: 'Ship activity intelligence', priorityRank: 1, timeHorizon: 'medium_term', successSignals: ['A real vertical slice'] };

describe('activity goals service', () => {
  beforeEach(() => query.mockReset());

  it('creates a goal scoped to the authenticated user', async () => {
    query.mockResolvedValueOnce([{ insertId: 12 }]).mockResolvedValueOnce([[{
      id: 12, title: payload.title, description: null, priority_rank: 1, time_horizon: 'medium_term', status: 'active', domain: null, success_signals: [], anti_goals: [], version: 1, created_at: '2026-08-30T00:00:00Z', updated_at: '2026-08-30T00:00:00Z',
    }]]);

    await expect(createActivityGoal(owner, payload)).resolves.toMatchObject({ id: 12, title: payload.title, status: 'active' });
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(1);
  });

  it('cannot update or archive another users goal even when its id is known', async () => {
    query.mockResolvedValue([{ affectedRows: 0 }]);

    await expect(updateActivityGoal(other, { id: 12 }, { title: 'steal it' })).rejects.toMatchObject({ status: 404 });
    await expect(archiveActivityGoal(other, { id: 12 })).rejects.toMatchObject({ status: 404 });

    for (const [sql, values] of query.mock.calls) {
      expect(String(sql)).toMatch(/WHERE id = \? AND user_id = \?/i);
      expect(values).toContain(2);
    }
  });
});

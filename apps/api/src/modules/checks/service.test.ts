import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../../db/pool', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

import { resolveActualMinutes, upsertCheck } from './service';

const user = { id: 1, username: 't', isAdmin: false };

describe('resolveActualMinutes', () => {
  it('undone clears actual', () => {
    expect(resolveActualMinutes(false, 45, 30, 45)).toBeNull();
    expect(resolveActualMinutes(false, undefined, 30, 45)).toBeNull();
    expect(resolveActualMinutes(false, null, 30, 45)).toBeNull();
  });

  it('first complete defaults to plan duration when omitted', () => {
    expect(resolveActualMinutes(true, undefined, 30, null)).toBe(30);
    expect(resolveActualMinutes(true, undefined, 30, undefined)).toBe(30);
  });

  it('omitted re-complete preserves existing custom actual', () => {
    expect(resolveActualMinutes(true, undefined, 30, 45)).toBe(45);
  });

  it('explicit null resets to plan default', () => {
    expect(resolveActualMinutes(true, null, 30, 45)).toBe(30);
    expect(resolveActualMinutes(true, null, null, 45)).toBeNull();
  });

  it('explicit number wins when done', () => {
    expect(resolveActualMinutes(true, 20, 30, 45)).toBe(20);
  });
});

describe('upsertCheck', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns resolved CheckDayState after upsert', async () => {
    // ownership
    query.mockResolvedValueOnce([[{ id: 7 }]]);
    // plan durations
    query.mockResolvedValueOnce([[{ id: 7, duration_minutes: 30 }]]);
    // existing actuals
    query.mockResolvedValueOnce([[]]);
    // insert
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      upsertCheck(user, { planId: 7, date: '2026-08-12', done: true }),
    ).resolves.toEqual({ done: true, actualMinutes: 30 });

    expect(query).toHaveBeenLastCalledWith(
      expect.stringMatching(/INSERT INTO checks/i),
      [7, '2026-08-12', 1, 30],
    );
  });

  it('preserves existing custom actual when omitted on re-complete', async () => {
    query.mockResolvedValueOnce([[{ id: 7 }]]);
    query.mockResolvedValueOnce([[{ id: 7, duration_minutes: 30 }]]);
    query.mockResolvedValueOnce([[{
      plan_id: 7,
      check_date: '2026-08-12',
      actual_minutes: 45,
    }]]);
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      upsertCheck(user, { planId: 7, date: '2026-08-12', done: true }),
    ).resolves.toEqual({ done: true, actualMinutes: 45 });
  });

  it('clears actual when undone', async () => {
    query.mockResolvedValueOnce([[{ id: 7 }]]);
    query.mockResolvedValueOnce([[{ id: 7, duration_minutes: 30 }]]);
    query.mockResolvedValueOnce([[{
      plan_id: 7,
      check_date: '2026-08-12',
      actual_minutes: 45,
    }]]);
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      upsertCheck(user, { planId: 7, date: '2026-08-12', done: false }),
    ).resolves.toEqual({ done: false, actualMinutes: null });
  });

  it('explicit null resets to plan default', async () => {
    query.mockResolvedValueOnce([[{ id: 7 }]]);
    query.mockResolvedValueOnce([[{ id: 7, duration_minutes: 30 }]]);
    query.mockResolvedValueOnce([[{
      plan_id: 7,
      check_date: '2026-08-12',
      actual_minutes: 45,
    }]]);
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      upsertCheck(user, { planId: 7, date: '2026-08-12', done: true, actualMinutes: null }),
    ).resolves.toEqual({ done: true, actualMinutes: 30 });
  });
});

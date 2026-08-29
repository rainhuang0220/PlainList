import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../../db/pool', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

import { upsertReview } from './service';

const user = { id: 1, username: 'rain', isAdmin: false };

describe('upsertReview write window', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{ affectedRows: 1 }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 0, 2, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the server-local today', async () => {
    await upsertReview(user, { date: '2026-08-29' }, { content: '今天开始做实验分析。' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([1, '2026-08-29', '今天开始做实验分析。']);
  });

  it('allows yesterday so a midnight flush can finish', async () => {
    await upsertReview(user, { date: '2026-08-28' }, { content: '今天完成了论文实验。' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([1, '2026-08-28', '今天完成了论文实验。']);
  });

  it('rejects older dates', async () => {
    await expect(
      upsertReview(user, { date: '2026-08-20' }, { content: '历史' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects future dates', async () => {
    await expect(
      upsertReview(user, { date: '2026-08-30' }, { content: '明天' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createWeeklyReviewSnapshotScheduler } from './weeklyReviewSnapshot';

describe('weekly review snapshot scheduler', () => {
  it('runs startup catch-up and recalculates the next local-midnight delay after every run', async () => {
    const catchUp = vi.fn().mockResolvedValue(false);
    const millisecondsUntilNextMidnight = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    const scheduled: Array<() => void> = [];
    const stop = createWeeklyReviewSnapshotScheduler({
      catchUp,
      millisecondsUntilNextMidnight,
      retryDelayMilliseconds: 60_000,
      setTimer: (callback) => {
        scheduled.push(callback);
        return {} as NodeJS.Timeout;
      },
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    expect(catchUp).toHaveBeenCalledTimes(1);
    expect(millisecondsUntilNextMidnight).toHaveBeenCalledTimes(1);

    scheduled[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(catchUp).toHaveBeenCalledTimes(2);
    expect(millisecondsUntilNextMidnight).toHaveBeenCalledTimes(2);

    stop();
  });

  it('performs one bounded delayed retry for retryable same-day snapshots', async () => {
    const catchUp = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const scheduled: Array<{ callback: () => void; milliseconds: number }> = [];
    const stop = createWeeklyReviewSnapshotScheduler({
      catchUp,
      millisecondsUntilNextMidnight: () => 10_000,
      retryDelayMilliseconds: 100,
      setTimer: (callback, milliseconds) => {
        scheduled.push({ callback, milliseconds });
        return {} as NodeJS.Timeout;
      },
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(scheduled.map((item) => item.milliseconds)).toEqual(expect.arrayContaining([10_000, 100]));

    scheduled.find((item) => item.milliseconds === 100)?.callback();
    await Promise.resolve();
    await Promise.resolve();
    expect(catchUp).toHaveBeenCalledTimes(2);
    expect(scheduled.filter((item) => item.milliseconds === 100)).toHaveLength(1);
    stop();
  });

  it('performs one bounded delayed retry when catch-up itself rejects', async () => {
    const catchUp = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce(false);
    const scheduled: Array<{ callback: () => void; milliseconds: number }> = [];
    const stop = createWeeklyReviewSnapshotScheduler({
      catchUp,
      millisecondsUntilNextMidnight: () => 10_000,
      retryDelayMilliseconds: 100,
      setTimer: (callback, milliseconds) => {
        scheduled.push({ callback, milliseconds });
        return {} as NodeJS.Timeout;
      },
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(scheduled.map((item) => item.milliseconds)).toContain(100);

    scheduled.find((item) => item.milliseconds === 100)?.callback();
    await Promise.resolve();
    await Promise.resolve();
    expect(catchUp).toHaveBeenCalledTimes(2);
    stop();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createWeeklyReviewSnapshotScheduler } from './weeklyReviewSnapshot';

describe('weekly review snapshot scheduler', () => {
  it('runs startup catch-up and recalculates the next local-midnight delay after every run', async () => {
    const catchUp = vi.fn().mockResolvedValue(false);
    const millisecondsUntilNextMidnight = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    const scheduled: Array<() => void> = [];
    const stop = createWeeklyReviewSnapshotScheduler({
      catchUp,
      recover: vi.fn().mockResolvedValue(undefined),
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
      recover: vi.fn().mockResolvedValue(undefined),
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
      recover: vi.fn().mockResolvedValue(undefined),
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

  it('runs recovery immediately and once per recovery interval', async () => {
    const catchUp = vi.fn().mockResolvedValue(false);
    let resolveFirstRecovery!: () => void;
    const firstRecovery = new Promise<void>((resolve) => {
      resolveFirstRecovery = resolve;
    });
    let activeRecoveries = 0;
    let maxActiveRecoveries = 0;
    const recover = vi.fn()
      .mockImplementationOnce(() => {
        activeRecoveries += 1;
        maxActiveRecoveries = Math.max(maxActiveRecoveries, activeRecoveries);
        return firstRecovery.finally(() => { activeRecoveries -= 1; });
      })
      .mockResolvedValue(undefined);
    const scheduled: Array<{ callback: () => void; milliseconds: number }> = [];
    const stop = createWeeklyReviewSnapshotScheduler({
      catchUp,
      recover,
      millisecondsUntilNextMidnight: () => 10_000,
      retryDelayMilliseconds: 100,
      recoveryIntervalMilliseconds: 60_000,
      setTimer: (callback, milliseconds) => {
        scheduled.push({ callback, milliseconds });
        return {} as NodeJS.Timeout;
      },
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    expect(recover).toHaveBeenCalledTimes(1);

    scheduled.find((item) => item.milliseconds === 60_000)?.callback();
    expect(recover).toHaveBeenCalledTimes(1);
    expect(maxActiveRecoveries).toBe(1);

    resolveFirstRecovery();
    await firstRecovery;
    await new Promise<void>((resolve) => setImmediate(resolve));

    scheduled.filter((item) => item.milliseconds === 60_000).at(-1)?.callback();
    await vi.waitFor(() => expect(recover).toHaveBeenCalledTimes(2));

    stop();
  });
});

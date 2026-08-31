import { describe, expect, it, vi } from 'vitest';
import { createWeeklyReviewSnapshotScheduler } from './weeklyReviewSnapshot';

describe('weekly review snapshot scheduler', () => {
  it('runs startup catch-up and recalculates the next local-midnight delay after every run', async () => {
    const catchUp = vi.fn().mockResolvedValue(undefined);
    const millisecondsUntilNextMidnight = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    const scheduled: Array<() => void> = [];
    const stop = createWeeklyReviewSnapshotScheduler({
      catchUp,
      millisecondsUntilNextMidnight,
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
});

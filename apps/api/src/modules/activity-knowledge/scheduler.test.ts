import { describe, expect, it, vi } from 'vitest';
import { createActivityIntelligenceScheduler } from './scheduler';

describe('activity intelligence scheduler', () => {
  it('generates at startup and again after the next local midnight', async () => {
    const catchUp = vi.fn().mockResolvedValue(undefined);
    const scheduled: Array<() => void> = [];
    const stop = createActivityIntelligenceScheduler({
      catchUp,
      millisecondsUntilNextMidnight: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000),
      setTimer: (callback) => {
        scheduled.push(callback);
        return {} as NodeJS.Timeout;
      },
      clearTimer: vi.fn(),
    });

    await Promise.resolve();
    expect(catchUp).toHaveBeenCalledTimes(1);
    scheduled[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(catchUp).toHaveBeenCalledTimes(2);
    stop();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalDayClock } from './localDayClock';

describe('localDayClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once at the next local midnight', async () => {
    vi.setSystemTime(new Date(2026, 7, 28, 23, 59, 59, 400));
    const clock = createLocalDayClock();
    const days: string[] = [];
    clock.subscribe((dateKey) => days.push(dateKey));
    clock.start();

    await vi.advanceTimersByTimeAsync(400);
    expect(days).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(days).toEqual(['2026-08-29']);
    clock.stop();
  });

  it('on resume after sleep jumps to the real current date', () => {
    vi.setSystemTime(new Date(2026, 7, 28, 23, 50, 0));
    const clock = createLocalDayClock();
    const days: string[] = [];
    clock.subscribe((dateKey) => days.push(dateKey));
    clock.start();

    vi.setSystemTime(new Date(2026, 7, 29, 8, 0, 0));
    clock.handleForeground();
    expect(days).toEqual(['2026-08-29']);
    clock.stop();
  });

  it('does not emit when resume is still the same local day', () => {
    vi.setSystemTime(new Date(2026, 7, 29, 9, 0, 0));
    const clock = createLocalDayClock();
    const days: string[] = [];
    clock.subscribe((dateKey) => days.push(dateKey));
    clock.start();
    clock.handleForeground();
    expect(days).toEqual([]);
    clock.stop();
  });
});
